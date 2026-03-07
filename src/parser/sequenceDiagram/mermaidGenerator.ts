/**
 * mermaidGenerator.ts — converts SeqAst to Mermaid sequenceDiagram content.
 *
 * Also builds:
 *   - idToUuid: participantId → node UUID (for actor/component click navigation)
 *   - messageLabelToUuid: mermaid label string → UUID (for message click navigation)
 */
import type { ComponentNode } from "../../store/types"
import { findNodeByPath } from "../../utils/nodeUtils"
import { findComponentByInterfaceId, resolveUseCaseByPath } from "../../utils/diagramResolvers"
import { findNode } from "../../store/useSystemStore"
import { parseSequenceDiagramCst } from "./parser"
import { buildSeqAst, type SeqAst, type SeqStatement, type SeqMessage, type SeqNote } from "./visitor"

function escapeLabel(text: string): string {
  return text.replace(/\n/g, "<br/>")
}

/** Mermaid participant IDs cannot contain spaces — replace with underscores. */
function sanitizeMermaidId(id: string): string {
  return id.replace(/\s+/g, "_")
}

function resolveParticipantUuid(
  path: string[],
  ownerComp: ComponentNode,
  root: ComponentNode,
): string | null {
  if (path.length === 1) {
    const id = path[0]
    if (ownerComp.id === id) return ownerComp.uuid
    return ownerComp.actors?.find((a) => a.id === id)?.uuid
      ?? ownerComp.subComponents?.find((c) => c.id === id)?.uuid
      ?? null
  }
  return findNodeByPath(root, path.join("/"))
}

/** Recursively collect all SeqMessage nodes from a statement list (including inside blocks). */
function collectMessages(statements: SeqStatement[]): SeqMessage[] {
  const result: SeqMessage[] = []
  for (const stmt of statements) {
    if ("sections" in stmt) {
      for (const section of stmt.sections) result.push(...collectMessages(section.statements))
    } else if (!("position" in stmt)) {
      result.push(stmt as SeqMessage)
    }
  }
  return result
}

/** Emit Mermaid lines for a block section separator keyword. */
function sectionKeyword(kind: "loop" | "alt" | "par" | "opt"): string {
  return kind === "alt" ? "else" : "and"
}

export function generateSequenceMermaidFromAst(
  ast: SeqAst,
  ownerComp: ComponentNode | null,
  root: ComponentNode,
  ownerCompUuid?: string,
): { mermaidContent: string; idToUuid: Record<string, string>; messageLabelToUuid: Record<string, string> } {
  const idToUuid: Record<string, string> = {}
  const messageLabelToUuid: Record<string, string> = {}

  // ─── Participant lines ───────────────────────────────────────────────────────
  let mermaidContent = "sequenceDiagram\n"
  const declaredMermaidIds = new Set<string>()
  for (const decl of ast.declarations) {
    const mermaidId = sanitizeMermaidId(decl.id)
    declaredMermaidIds.add(mermaidId)
    const uuid = ownerComp ? resolveParticipantUuid(decl.path, ownerComp, root) : null
    if (uuid) idToUuid[mermaidId] = uuid
    const node = uuid ? findNode([root], uuid) : null
    const lastSegment = decl.path[decl.path.length - 1]
    const stereotype = decl.entityType === "actor" ? "«actor»" : "«component»"
    const displayName = node?.name ?? lastSegment
    mermaidContent += `participant ${mermaidId} as ${stereotype}<br/>${displayName}\n`
  }

  // Auto-declare any undeclared participants referenced in messages (including inside blocks).
  for (const msg of collectMessages(ast.statements)) {
    for (const raw of [msg.from, msg.to]) {
      const mermaidId = sanitizeMermaidId(raw)
      if (!declaredMermaidIds.has(mermaidId)) {
        declaredMermaidIds.add(mermaidId)
        mermaidContent += `participant ${mermaidId} as ${raw}\n`
      }
    }
  }

  // ─── Messages, notes, and blocks in source order ──────────────────────────────
  mermaidContent += emitStatements(ast.statements, ownerComp, root, ownerCompUuid, messageLabelToUuid)

  return { mermaidContent, idToUuid, messageLabelToUuid }
}

function emitStatements(
  statements: SeqStatement[],
  ownerComp: ComponentNode | null,
  root: ComponentNode,
  ownerCompUuid: string | undefined,
  messageLabelToUuid: Record<string, string>,
  indent = "",
): string {
  let out = ""
  for (const stmt of statements) {
    if ("sections" in stmt) {
      // Block construct
      const { kind, sections } = stmt
      const firstSection = sections[0]
      const guardText = firstSection.guard ? ` ${firstSection.guard}` : ""
      out += `${indent}${kind}${guardText}\n`
      out += emitStatements(firstSection.statements, ownerComp, root, ownerCompUuid, messageLabelToUuid, indent + "  ")
      for (const section of sections.slice(1)) {
        const secKw = sectionKeyword(kind)
        const secGuard = section.guard ? ` ${section.guard}` : ""
        out += `${indent}${secKw}${secGuard}\n`
        out += emitStatements(section.statements, ownerComp, root, ownerCompUuid, messageLabelToUuid, indent + "  ")
      }
      out += `${indent}end\n`
    } else if ("position" in stmt) {
      // Note
      const note = stmt as SeqNote
      const text = escapeLabel(note.text)
      if (note.position.kind === "side") {
        out += `${indent}note ${note.position.side} of ${sanitizeMermaidId(note.position.participant)}: ${text}\n`
      } else {
        const [p1, p2] = note.position.participants
        out += p2
          ? `${indent}note over ${sanitizeMermaidId(p1)}, ${sanitizeMermaidId(p2)}: ${text}\n`
          : `${indent}note over ${sanitizeMermaidId(p1)}: ${text}\n`
      }
    } else {
      // Message
      const msg = stmt as SeqMessage
      const fromId = sanitizeMermaidId(msg.from)
      const toId = sanitizeMermaidId(msg.to)
      if (msg.functionRef) {
        const { interfaceId, functionId, rawParams } = msg.functionRef
        const mermaidLabel = `${interfaceId}:${functionId}(${rawParams})`
        const compUuid = findComponentByInterfaceId(root, interfaceId)
        if (compUuid && !messageLabelToUuid[mermaidLabel]) messageLabelToUuid[mermaidLabel] = compUuid
        out += `${indent}${fromId}->>${toId}: ${mermaidLabel}\n`
      } else if (msg.useCaseRef) {
        const { path, label: customLabel } = msg.useCaseRef
        const ucId = path[path.length - 1]
        const ucUuid = ownerComp && ownerCompUuid
          ? resolveUseCaseByPath(path, root, ownerComp, ownerCompUuid)
          : undefined
        const ucNode = ucUuid ? findNode([root], ucUuid) : null
        const displayLabel = customLabel ?? ucNode?.name ?? ucId
        const renderedLabel = escapeLabel(displayLabel)
        if (ucUuid && !messageLabelToUuid[renderedLabel]) messageLabelToUuid[renderedLabel] = ucUuid
        out += `${indent}${fromId}->>${toId}: ${renderedLabel}\n`
      } else if (msg.label) {
        out += `${indent}${fromId}->>${toId}: ${escapeLabel(msg.label)}\n`
      } else {
        out += `${indent}${fromId}->>${toId}\n`
      }
    }
  }
  return out
}

export function generateSequenceMermaid(
  content: string,
  ownerComp: ComponentNode | null,
  root: ComponentNode,
  ownerCompUuid?: string,
): { mermaidContent: string; idToUuid: Record<string, string>; messageLabelToUuid: Record<string, string> } {
  const { cst, lexErrors } = parseSequenceDiagramCst(content)
  if (lexErrors.length) {
    return { mermaidContent: "sequenceDiagram\n", idToUuid: {}, messageLabelToUuid: {} }
  }
  const ast = buildSeqAst(cst)
  return generateSequenceMermaidFromAst(ast, ownerComp, root, ownerCompUuid)
}
