/**
 * mermaidGenerator.ts — converts SeqAst to Mermaid sequenceDiagram content.
 *
 * Also builds:
 *   - idToUuid: participantId → node UUID (for actor/component click navigation)
 *   - messageLabelToUuid: mermaid label string → UUID (for message click navigation)
 */
import type { ComponentNode } from "../../store/types"
import { findNodeByPath } from "../../utils/nodeUtils"
import { findComponentByInterfaceId, findInterfaceUuidByInterfaceId, resolveUseCaseByPath } from "../../utils/diagramResolvers"
import { findNodeByUuid } from "../../nodes/nodeTree"
import { parseSequenceDiagramCst } from "./parser"
import { buildSeqAst, flattenMessages, type SeqAst, type SeqStatement, type SeqMessage, type SeqNote } from "./visitor"

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

export function generateSequenceMermaidFromAst(
  ast: SeqAst,
  ownerComp: ComponentNode | null,
  root: ComponentNode,
  ownerCompUuid?: string,
): { mermaidContent: string; idToUuid: Record<string, string>; messageLabelToUuid: Record<string, string>; messageLabelToInterfaceUuid: Record<string, string> } {
  const idToUuid: Record<string, string> = {}
  const messageLabelToUuid: Record<string, string> = {}
  const messageLabelToInterfaceUuid: Record<string, string> = {}

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
  mermaidContent += emitStatements(ast.statements, ownerComp, root, ownerCompUuid, messageLabelToUuid, messageLabelToInterfaceUuid, new Map())

  return { mermaidContent, idToUuid, messageLabelToUuid, messageLabelToInterfaceUuid }
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

function emitStatements(
  statements: SeqStatement[],
  ownerComp: ComponentNode | null,
  root: ComponentNode,
  ownerCompUuid: string | undefined,
  messageLabelToUuid: Record<string, string>,
  messageLabelToInterfaceUuid: Record<string, string>,
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
      out += emitStatements(firstSection.statements, ownerComp, root, ownerCompUuid, messageLabelToUuid, messageLabelToInterfaceUuid, labelMap, indent + "  ")
      for (const section of sections.slice(1)) {
        const secKw = sectionKeyword(kind)
        const secGuard = section.guard ? ` ${section.guard}` : ""
        out += `${indent}${secKw}${secGuard}\n`
        out += emitStatements(section.statements, ownerComp, root, ownerCompUuid, messageLabelToUuid, messageLabelToInterfaceUuid, labelMap, indent + "  ")
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
        const { interfaceId, functionId, rawParams, label } = msg.functionRef
        const baseLabel = label != null ? label : `${functionId}(${extractParamNames(rawParams)})`
        const compUuid = findComponentByInterfaceId(root, interfaceId)
        const ifaceUuid = findInterfaceUuidByInterfaceId(root, interfaceId)
        // Use interfaceId:functionId as the dedup key so that two different functions
        // with the same name (on different interfaces) are treated as distinct.
        const fnKey = `${interfaceId}:${functionId}`
        const mermaidLabel = resolveLabel(baseLabel, fnKey, labelMap)
        if (compUuid && !messageLabelToUuid[mermaidLabel]) messageLabelToUuid[mermaidLabel] = compUuid
        if (ifaceUuid && !messageLabelToInterfaceUuid[mermaidLabel]) messageLabelToInterfaceUuid[mermaidLabel] = ifaceUuid
        out += `${indent}${fromId}${msg.arrow}${toId}: ${mermaidLabel}\n`
      } else if (msg.useCaseRef) {
        const { path, label: customLabel } = msg.useCaseRef
        const ucId = path[path.length - 1]
        const ucUuid = ownerComp && ownerCompUuid
          ? resolveUseCaseByPath(path, root, ownerComp, ownerCompUuid)
          : undefined
        const ucNode = ucUuid ? findNodeByUuid([root], ucUuid) : null
        const baseLabel = customLabel ?? ucNode?.name ?? ucId
        const mermaidLabel = resolveLabel(baseLabel, ucUuid, labelMap)
        const renderedLabel = escapeLabel(mermaidLabel)
        if (ucUuid && !messageLabelToUuid[renderedLabel]) messageLabelToUuid[renderedLabel] = ucUuid
        out += `${indent}${fromId}${msg.arrow}${toId}: ${renderedLabel}\n`
      } else if (msg.label) {
        out += `${indent}${fromId}${msg.arrow}${toId}: ${escapeLabel(msg.label)}\n`
      } else {
        out += `${indent}${fromId}${msg.arrow}${toId}\n`
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
): { mermaidContent: string; idToUuid: Record<string, string>; messageLabelToUuid: Record<string, string>; messageLabelToInterfaceUuid: Record<string, string> } {
  const { cst, lexErrors } = parseSequenceDiagramCst(content)
  if (lexErrors.length) {
    return { mermaidContent: "sequenceDiagram\n", idToUuid: {}, messageLabelToUuid: {}, messageLabelToInterfaceUuid: {} }
  }
  const ast = buildSeqAst(cst)
  return generateSequenceMermaidFromAst(ast, ownerComp, root, ownerCompUuid)
}
