/**
 * mermaidGenerator.ts — converts SeqAst to Mermaid sequenceDiagram content.
 *
 * Also builds:
 *   - idToUuid: participantId → node UUID (for actor/component click navigation)
 *   - messageLabelToUuid: mermaid label string → UUID (for message click navigation)
 */
import type { ComponentNode } from "../../store/types"
import { findNodeByPath } from "../../utils/nodeUtils"
import {
  resolveFunctionRefTarget,
  resolveUseCaseByPath,
  resolveSeqDiagramByPath,
  assertUseCaseReferenceInScope,
  assertSeqDiagramReferenceInScope,
} from "../../utils/diagramResolvers"
import { findNodeByUuid } from "../../nodes/nodeTree"
import { parseSequenceDiagramCst } from "./parser"
import { buildSeqAst, flattenMessages, type SeqAst, type SeqStatement } from "./visitor"

function assertNever(x: never): never {
  throw new Error(`Unhandled SeqMessageContent kind: ${JSON.stringify(x)}`)
}

function escapeLabel(text: string): string {
  return text.replace(/\n/g, "<br/>")
}

/**
 * Extract only the parameter names from a raw parameter string.
 * e.g. "p1: string, p2: integer?" → "p1, p2"
 */
function extractParamNames(rawParams: string): string {
  if (!rawParams.trim()) return ""
  return rawParams
    .split(",")
    .map((p) => {
      const colonIdx = p.indexOf(":")
      return colonIdx === -1 ? p.trim() : p.slice(0, colonIdx).trim()
    })
    .join(", ")
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

/** Emit Mermaid lines for a block section separator keyword. */
function sectionKeyword(kind: "loop" | "alt" | "par" | "opt"): string {
  return kind === "alt" ? "else" : "and"
}

export type SequenceMessageLink = {
  kind: "label" | "functionRef" | "useCaseRef" | "seqDiagramRef"
  renderedLabel: string
  targetUuid?: string
  interfaceUuid?: string
  clickable: boolean
}

export type SequenceMermaidResult = {
  mermaidContent: string
  idToUuid: Record<string, string>
  messageLabelToUuid: Record<string, string>
  messageLabelToInterfaceUuid: Record<string, string>
  messageLinks: SequenceMessageLink[]
}

export function generateSequenceMermaidFromAst(
  ast: SeqAst,
  ownerComp: ComponentNode | null,
  root: ComponentNode,
  ownerCompUuid?: string,
): SequenceMermaidResult {
  const idToUuid: Record<string, string> = {}
  const messageLabelToUuid: Record<string, string> = {}
  const messageLabelToInterfaceUuid: Record<string, string> = {}
  const messageLinks: SequenceMessageLink[] = []

  // ─── Participant lines ───────────────────────────────────────────────────────
  let mermaidContent = "sequenceDiagram\n"
  const declaredMermaidIds = new Set<string>()
  for (const decl of ast.declarations) {
    const mermaidId = sanitizeMermaidId(decl.id)
    declaredMermaidIds.add(mermaidId)
    const uuid = ownerComp ? resolveParticipantUuid(decl.path, ownerComp, root) : null
    if (uuid) idToUuid[mermaidId] = uuid
    const node = uuid ? findNodeByUuid([root], uuid) : null
    const lastSegment = decl.path[decl.path.length - 1]
    const stereotype = decl.entityType === "actor" ? "«actor»" : "«component»"
    const displayName = node?.name ?? lastSegment
    mermaidContent += `participant ${mermaidId} as ${stereotype}<br/>${displayName}\n`
  }

  // Auto-declare any undeclared participants referenced in messages (including inside blocks).
  for (const msg of flattenMessages(ast.statements)) {
    for (const raw of [msg.from, msg.to]) {
      const mermaidId = sanitizeMermaidId(raw)
      if (!declaredMermaidIds.has(mermaidId)) {
        declaredMermaidIds.add(mermaidId)
        mermaidContent += `participant ${mermaidId} as ${raw}\n`
      }
    }
  }

  // ─── Messages, notes, and blocks in source order ──────────────────────────────
  mermaidContent += emitStatements(ast.statements, ownerComp, root, ownerCompUuid, messageLabelToUuid, messageLabelToInterfaceUuid, messageLinks, new Map())

  return { mermaidContent, idToUuid, messageLabelToUuid, messageLabelToInterfaceUuid, messageLinks }
}

// Maps each base label to a per-uuid rendered label assignment.
// Inner map key: uuid of the target (undefined for unresolved refs).
// Inner map value: the rendered label (with suffix) assigned to that uuid.
// This ensures: same label + same uuid → no suffix; same label + different uuid → numbered suffix.
type LabelMap = Map<string, Map<string | undefined, string>>

function resolveLabel(baseLabel: string, uuid: string | undefined, labelMap: LabelMap): string {
  let byUuid = labelMap.get(baseLabel)
  if (!byUuid) {
    byUuid = new Map([[uuid, baseLabel]])
    labelMap.set(baseLabel, byUuid)
    return baseLabel
  }
  const existing = byUuid.get(uuid)
  if (existing !== undefined) return existing
  const rendered = `${baseLabel} (${byUuid.size + 1})`
  byUuid.set(uuid, rendered)
  return rendered
}

// eslint-disable-next-line complexity
function emitStatements(
  statements: SeqStatement[],
  ownerComp: ComponentNode | null,
  root: ComponentNode,
  ownerCompUuid: string | undefined,
  messageLabelToUuid: Record<string, string>,
  messageLabelToInterfaceUuid: Record<string, string>,
  messageLinks: SequenceMessageLink[],
  labelMap: LabelMap,
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
      out += emitStatements(firstSection.statements, ownerComp, root, ownerCompUuid, messageLabelToUuid, messageLabelToInterfaceUuid, messageLinks, labelMap, indent + "  ")
      for (const section of sections.slice(1)) {
        const secKw = sectionKeyword(kind)
        const secGuard = section.guard ? ` ${section.guard}` : ""
        out += `${indent}${secKw}${secGuard}\n`
        out += emitStatements(section.statements, ownerComp, root, ownerCompUuid, messageLabelToUuid, messageLabelToInterfaceUuid, messageLinks, labelMap, indent + "  ")
      }
      out += `${indent}end\n`
    } else if ("action" in stmt) {
      // SeqActivation
      out += `${indent}${stmt.action} ${sanitizeMermaidId(stmt.participant)}\n`
    } else if ("position" in stmt) {
      // Note
      const note = stmt
      const text = escapeLabel(note.text)
      if (note.position.kind === "side") {
        out += `${indent}note ${note.position.side} of ${sanitizeMermaidId(note.position.participant)}: ${text}\n`
      } else {
        const [p1, p2] = note.position.participants
        out += p2
          ? `${indent}note over ${sanitizeMermaidId(p1)}, ${sanitizeMermaidId(p2)}: ${text}\n`
          : `${indent}note over ${sanitizeMermaidId(p1)}: ${text}\n`
      }
    } else if ("from" in stmt) {
      // Message
      const msg = stmt
      const fromId = sanitizeMermaidId(msg.from)
      const toId = sanitizeMermaidId(msg.to)
      const c = msg.content
      switch (c.kind) {
        case "functionRef": {
          const baseLabel = c.label != null ? c.label : `${c.functionId}(${extractParamNames(c.rawParams)})`
          const target = resolveFunctionRefTarget(root, msg.to, c.interfaceId, c.functionId)
          const fnKey = `${msg.to}:${c.interfaceId}:${c.functionId}`
          const mermaidLabel = resolveLabel(baseLabel, fnKey, labelMap)
          const renderedLabel = escapeLabel(mermaidLabel)
          if (target?.componentUuid && !messageLabelToUuid[mermaidLabel]) messageLabelToUuid[mermaidLabel] = target.componentUuid
          if (target?.interfaceUuid && !messageLabelToInterfaceUuid[mermaidLabel]) messageLabelToInterfaceUuid[mermaidLabel] = target.interfaceUuid
          messageLinks.push({
            kind: "functionRef",
            renderedLabel: mermaidLabel,
            targetUuid: target?.componentUuid,
            interfaceUuid: target?.interfaceUuid,
            clickable: target?.componentUuid != null,
          })
          out += `${indent}${fromId}${msg.arrow}${toId}: ${renderedLabel}\n`
          break
        }
        case "useCaseRef": {
          if (ownerCompUuid) assertUseCaseReferenceInScope(c.path, root, ownerCompUuid)
          const ucId = c.path[c.path.length - 1]
          const ucUuid = ownerComp && ownerCompUuid
            ? resolveUseCaseByPath(c.path, root, ownerComp, ownerCompUuid)
            : undefined
          const ucNode = ucUuid ? findNodeByUuid([root], ucUuid) : null
          const baseLabel = c.label ?? ucNode?.name ?? ucId
          const mermaidLabel = resolveLabel(baseLabel, ucUuid, labelMap)
          const renderedLabel = escapeLabel(mermaidLabel)
          if (ucUuid && !messageLabelToUuid[mermaidLabel]) messageLabelToUuid[mermaidLabel] = ucUuid
          messageLinks.push({
            kind: "useCaseRef",
            renderedLabel: mermaidLabel,
            targetUuid: ucUuid,
            clickable: ucUuid != null,
          })
          out += `${indent}${fromId}${msg.arrow}${toId}: ${renderedLabel}\n`
          break
        }
        case "seqDiagramRef": {
          if (ownerCompUuid) assertSeqDiagramReferenceInScope(c.path, root, ownerCompUuid)
          const seqId = c.path[c.path.length - 1]
          const seqUuid = ownerComp && ownerCompUuid
            ? resolveSeqDiagramByPath(c.path, root, ownerComp, ownerCompUuid)
            : undefined
          const seqNode = seqUuid ? findNodeByUuid([root], seqUuid) : null
          const baseLabel = c.label ?? seqNode?.name ?? seqId
          const mermaidLabel = resolveLabel(baseLabel, seqUuid, labelMap)
          const renderedLabel = escapeLabel(mermaidLabel)
          if (seqUuid && !messageLabelToUuid[mermaidLabel]) messageLabelToUuid[mermaidLabel] = seqUuid
          messageLinks.push({
            kind: "seqDiagramRef",
            renderedLabel: mermaidLabel,
            targetUuid: seqUuid,
            clickable: seqUuid != null,
          })
          out += `${indent}${fromId}${msg.arrow}${toId}: ${renderedLabel}\n`
          break
        }
        case "label":
          messageLinks.push({
            kind: "label",
            renderedLabel: c.text,
            clickable: false,
          })
          out += `${indent}${fromId}${msg.arrow}${toId}: ${escapeLabel(c.text)}\n`
          break
        case "none":
          out += `${indent}${fromId}${msg.arrow}${toId}\n`
          break
        default:
          assertNever(c)
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
): SequenceMermaidResult {
  if (!content.trim()) return { mermaidContent: "sequenceDiagram\n", idToUuid: {}, messageLabelToUuid: {}, messageLabelToInterfaceUuid: {}, messageLinks: [] }
  const { cst, lexErrors } = parseSequenceDiagramCst(content)
  if (lexErrors.length) {
    return { mermaidContent: "sequenceDiagram\n", idToUuid: {}, messageLabelToUuid: {}, messageLabelToInterfaceUuid: {}, messageLinks: [] }
  }
  const ast = buildSeqAst(cst)
  return generateSequenceMermaidFromAst(ast, ownerComp, root, ownerCompUuid)
}
