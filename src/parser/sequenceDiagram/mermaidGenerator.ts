/**
 * mermaidGenerator.ts — converts SeqAst to Mermaid sequenceDiagram content.
 *
 * Also builds:
 *   - idToUuid: participantId → node UUID (for actor/component click navigation)
 *   - messageLabelToUuid: mermaid label string → UUID (for message click navigation)
 */
import type { ComponentNode } from "../../store/types"
import { findNodeByPath } from "../../utils/nodeUtils"
import { findComponentByInterfaceId } from "../../utils/diagramResolvers"
import { parseSequenceDiagramCst } from "./parser"
import { buildSeqAst, type SeqAst } from "./visitor"

function escapeLabel(text: string): string {
  return text.replace(/\n/g, "<br/>")
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
): { mermaidContent: string; idToUuid: Record<string, string>; messageLabelToUuid: Record<string, string> } {
  const idToUuid: Record<string, string> = {}
  const messageLabelToUuid: Record<string, string> = {}

  // ─── Participant lines ───────────────────────────────────────────────────────
  let mermaidContent = "sequenceDiagram\n"
  for (const decl of ast.declarations) {
    if (ownerComp) {
      const uuid = resolveParticipantUuid(decl.path, ownerComp, root)
      if (uuid) idToUuid[decl.id] = uuid
    }
    const stereotype = decl.entityType === "actor" ? "«actor»" : "«component»"
    const displayName = decl.alias ?? decl.path[decl.path.length - 1]
    mermaidContent += `participant ${decl.id} as ${stereotype}<br/>${displayName}\n`
  }

  // ─── Message lines ───────────────────────────────────────────────────────────
  for (const msg of ast.messages) {
    if (msg.functionRef) {
      const { interfaceId, functionId, rawParams } = msg.functionRef
      const mermaidLabel = `${interfaceId}:${functionId}(${rawParams})`
      const compUuid = findComponentByInterfaceId(root, interfaceId)
      if (compUuid && !messageLabelToUuid[mermaidLabel]) messageLabelToUuid[mermaidLabel] = compUuid
      mermaidContent += `${msg.from}->>${msg.to}: ${mermaidLabel}\n`
    } else if (msg.label) {
      mermaidContent += `${msg.from}->>${msg.to}: ${escapeLabel(msg.label)}\n`
    } else {
      mermaidContent += `${msg.from}->>${msg.to}\n`
    }
  }

  // ─── Note lines ──────────────────────────────────────────────────────────────
  for (const note of ast.notes) {
    const text = escapeLabel(note.text)
    if (note.position.kind === "side") {
      mermaidContent += `note ${note.position.side} of ${note.position.participant}: ${text}\n`
    } else {
      const [p1, p2] = note.position.participants
      mermaidContent += p2
        ? `note over ${p1}, ${p2}: ${text}\n`
        : `note over ${p1}: ${text}\n`
    }
  }

  return { mermaidContent, idToUuid, messageLabelToUuid }
}

export function generateSequenceMermaid(
  content: string,
  ownerComp: ComponentNode | null,
  root: ComponentNode,
): { mermaidContent: string; idToUuid: Record<string, string>; messageLabelToUuid: Record<string, string> } {
  const { cst, lexErrors } = parseSequenceDiagramCst(content)
  if (lexErrors.length) {
    return { mermaidContent: "sequenceDiagram\n", idToUuid: {}, messageLabelToUuid: {} }
  }
  const ast = buildSeqAst(cst)
  return generateSequenceMermaidFromAst(ast, ownerComp, root)
}
