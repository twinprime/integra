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
import { buildSeqAst, type SeqAst } from "./visitor"

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

  // Auto-declare any undeclared participants referenced in messages so Mermaid
  // shows the original name (with spaces) instead of the sanitized id (underscores).
  for (const stmt of ast.statements) {
    if ("position" in stmt) continue
    for (const raw of [stmt.from, stmt.to]) {
      const mermaidId = sanitizeMermaidId(raw)
      if (!declaredMermaidIds.has(mermaidId)) {
        declaredMermaidIds.add(mermaidId)
        mermaidContent += `participant ${mermaidId} as ${raw}\n`
      }
    }
  }

  // ─── Messages and notes in source order ──────────────────────────────────────
  for (const stmt of ast.statements) {
    if ("position" in stmt) {
      // Note
      const text = escapeLabel(stmt.text)
      if (stmt.position.kind === "side") {
        mermaidContent += `note ${stmt.position.side} of ${sanitizeMermaidId(stmt.position.participant)}: ${text}\n`
      } else {
        const [p1, p2] = stmt.position.participants
        mermaidContent += p2
          ? `note over ${sanitizeMermaidId(p1)}, ${sanitizeMermaidId(p2)}: ${text}\n`
          : `note over ${sanitizeMermaidId(p1)}: ${text}\n`
      }
    } else {
      // Message
      const fromId = sanitizeMermaidId(stmt.from)
      const toId = sanitizeMermaidId(stmt.to)
      if (stmt.functionRef) {
        const { interfaceId, functionId, rawParams } = stmt.functionRef
        const mermaidLabel = `${interfaceId}:${functionId}(${rawParams})`
        const compUuid = findComponentByInterfaceId(root, interfaceId)
        if (compUuid && !messageLabelToUuid[mermaidLabel]) messageLabelToUuid[mermaidLabel] = compUuid
        mermaidContent += `${fromId}->>${toId}: ${mermaidLabel}\n`
      } else if (stmt.useCaseRef) {
        const { path, label: customLabel } = stmt.useCaseRef
        const ucId = path[path.length - 1]
        const ucUuid = ownerComp && ownerCompUuid
          ? resolveUseCaseByPath(path, root, ownerComp, ownerCompUuid)
          : undefined
        const ucNode = ucUuid ? findNode([root], ucUuid) : null
        const displayLabel = customLabel ?? ucNode?.name ?? ucId
        const renderedLabel = escapeLabel(displayLabel)
        if (ucUuid && !messageLabelToUuid[renderedLabel]) messageLabelToUuid[renderedLabel] = ucUuid
        mermaidContent += `${fromId}->>${toId}: ${renderedLabel}\n`
      } else if (stmt.label) {
        mermaidContent += `${fromId}->>${toId}: ${escapeLabel(stmt.label)}\n`
      } else {
        mermaidContent += `${fromId}->>${toId}\n`
      }
    }
  }

  return { mermaidContent, idToUuid, messageLabelToUuid }
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
