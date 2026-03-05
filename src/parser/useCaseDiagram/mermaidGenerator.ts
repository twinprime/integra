/**
 * mermaidGenerator.ts — converts UcdAst to Mermaid graph TD content.
 *
 * Also builds idToUuid: participantId → node UUID (for click navigation).
 */
import type { ComponentNode } from "../../store/types"
import { findNodeByPath } from "../../utils/nodeUtils"
import { findNode } from "../../store/useSystemStore"
import { parseUseCaseDiagramCst } from "./parser"
import { buildUcdAst, type UcdAst } from "./visitor"

function resolveUcdParticipantUuid(
  path: string[],
  ownerComp: ComponentNode,
  root: ComponentNode,
): string | null {
  if (path.length === 1) {
    const id = path[0]
    if (ownerComp.id === id) return ownerComp.uuid
    // actors
    const actor = ownerComp.actors?.find((a) => a.id === id)
    if (actor) return actor.uuid
    // subComponents
    const comp = ownerComp.subComponents?.find((c) => c.id === id)
    if (comp) return comp.uuid
    // use cases inside diagrams
    for (const d of ownerComp.useCaseDiagrams) {
      const uc = d.useCases?.find((u) => u.id === id)
      if (uc) return uc.uuid
    }
    return null
  }
  return findNodeByPath(root, path.join("/"))
}

export function generateUseCaseMermaidFromAst(
  ast: UcdAst,
  ownerComp: ComponentNode | null,
  root: ComponentNode,
): { mermaidContent: string; idToUuid: Record<string, string> } {
  const idToUuid: Record<string, string> = {}

  let mermaidContent = "graph TD\n"

  for (const decl of ast.declarations) {
    const uuid = ownerComp
      ? resolveUcdParticipantUuid(decl.path, ownerComp, root)
      : null
    if (uuid) idToUuid[decl.id] = uuid

    const node = uuid ? findNode([root], uuid) : null
    const lastSegment = decl.path[decl.path.length - 1]
    const displayName = decl.alias ?? node?.name ?? lastSegment

    if (decl.entityType === "actor" || decl.entityType === "component") {
      mermaidContent += `    ${decl.id}["${displayName}"]\n`
    } else {
      // use-case
      mermaidContent += `    ${decl.id}(("${displayName}"))\n`
    }
  }

  for (const link of ast.links) {
    mermaidContent += `    ${link.from} --> ${link.to}\n`
  }

  // Click directives for navigation
  for (const id of Object.keys(idToUuid)) {
    mermaidContent += `click ${id} __integraNavigate\n`
  }

  return { mermaidContent, idToUuid }
}

export function generateUseCaseMermaid(
  content: string,
  ownerComp: ComponentNode | null,
  root: ComponentNode,
): { mermaidContent: string; idToUuid: Record<string, string> } {
  const { cst, lexErrors } = parseUseCaseDiagramCst(content)
  if (lexErrors.length) {
    return { mermaidContent: "graph TD\n", idToUuid: {} }
  }
  const ast = buildUcdAst(cst)
  return generateUseCaseMermaidFromAst(ast, ownerComp, root)
}
