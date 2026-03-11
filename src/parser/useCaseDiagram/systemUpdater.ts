/**
 * systemUpdater.ts — replaces src/utils/useCaseDiagramParser.ts
 *
 * Parses use case diagram DSL content using the Chevrotain-based parser and
 * updates the component tree accordingly.
 */
import type { ComponentNode, ActorNode, UseCaseNode, UseCaseDiagramNode } from "../../store/types"
import { upsertNodeInTree, mergeLists } from "../../nodes/nodeTree"
import { findCompByUuid } from "../../nodes/nodeTree"
import { findNodeByPath, isInScope } from "../../utils/nodeUtils"
import { autoCreateByPath } from "../../utils/diagramResolvers"
import { parseUseCaseDiagramCst } from "./parser"
import { buildUcdAst } from "./visitor"

function findOwnerInTree(root: ComponentNode, uuid: string): ComponentNode | null {
  return findCompByUuid(root, uuid)
}

// eslint-disable-next-line complexity
export function parseUseCaseDiagram(
  content: string,
  rootComponent: ComponentNode,
  ownerComponentUuid: string,
  diagramUuid: string,
): ComponentNode {
  const { cst, lexErrors, parseErrors } = parseUseCaseDiagramCst(content)
  if (lexErrors.length || parseErrors.length) {
    const lexMessages = lexErrors.map((e) => {
      const loc = e.line != null ? `Line ${e.line}, Col ${e.column ?? 1}: ` : ""
      return `${loc}${e.message}`
    })
    const parseMessages = parseErrors.map((e) => {
      const line = e.token?.startLine
      const col = e.token?.startColumn
      const loc = line != null ? `Line ${line}, Col ${col ?? 1}: ` : ""
      return `${loc}${e.message}`
    })
    throw new Error([...lexMessages, ...parseMessages].join("\n"))
  }

  const ast = buildUcdAst(cst)

  // Mutable root — may be updated as missing path nodes are auto-created
  let root = rootComponent

  const localActors: ActorNode[] = []
  const localComponents: ComponentNode[] = []
  const localUseCases: UseCaseNode[] = []
  const externalUuids: string[] = []

  // Maps participantId → treeNodeId (path[0] for local)
  const participantToTreeId = new Map<string, string>()
  // Track ids of local use-case nodes for reference resolution
  const localUseCaseIds: string[] = []

  for (const decl of ast.declarations) {
    const treeNodeId = decl.path[decl.path.length - 1]
    participantToTreeId.set(decl.id, decl.path[0])

    if (decl.path.length === 1) {
      if (decl.entityType === "actor") {
        localActors.push({
          uuid: crypto.randomUUID(), id: treeNodeId, name: decl.alias ?? treeNodeId,
          type: "actor", description: "",
        })
      } else if (decl.entityType === "component") {
        localComponents.push({
          uuid: crypto.randomUUID(), id: treeNodeId, name: decl.alias ?? treeNodeId,
          type: "component", description: "", subComponents: [], actors: [], useCaseDiagrams: [], interfaces: [],
        })
      } else {
        // use-case
        localUseCases.push({
          uuid: crypto.randomUUID(), id: treeNodeId, name: decl.alias ?? treeNodeId,
          type: "use-case", description: "", sequenceDiagrams: [],
        })
        localUseCaseIds.push(decl.id)
      }
    } else {
      // External node (try relative to ownerComp first)
      const pathStr = decl.path.join("/")
      let uuid = findNodeByPath(root, pathStr, ownerComponentUuid)
      if (!uuid) {
        const created = autoCreateByPath(root, decl.path, decl.entityType as "actor" | "component", ownerComponentUuid)
        if (!created) throw new Error(`Cannot resolve path: "${pathStr}"`)
        root = created.updatedRoot
        uuid = created.uuid
      }
      // Scope check: verify the owning component is in scope for this diagram
      const owningCompUuid = decl.entityType === "component"
        ? uuid
        : findNodeByPath(root, decl.path.slice(0, -1).join("/"), ownerComponentUuid)
      if (!owningCompUuid || !isInScope(root, ownerComponentUuid, owningCompUuid)) {
        throw new Error(`Reference "${pathStr}" is out of scope for this diagram`)
      }
      if (!externalUuids.includes(uuid)) externalUuids.push(uuid)
    }
  }

  // Validate use case ID uniqueness within the component (across all diagrams)
  const ownerBefore = findOwnerInTree(root, ownerComponentUuid)
  if (ownerBefore) {
    for (const diagram of ownerBefore.useCaseDiagrams) {
      if (diagram.uuid === diagramUuid) continue
      for (const item of localUseCases) {
        if (diagram.useCases.some((uc) => uc.id === item.id)) {
          throw new Error(`Use case id "${item.id}" already exists in another diagram of this component`)
        }
      }
    }
  }

  // Upsert actors and sub-components into owner component
  let updatedRoot = upsertNodeInTree(root, ownerComponentUuid, (node) => {
    const comp = node as ComponentNode
    return {
      ...comp,
      actors: mergeLists(comp.actors ?? [], localActors),
      subComponents: mergeLists(comp.subComponents, localComponents),
    }
  })

  // Resolve referencedNodeIds from updated tree
  const updatedOwnerComp = findOwnerInTree(updatedRoot, ownerComponentUuid)
  const referencedNodeIds: string[] = [...externalUuids]

  if (updatedOwnerComp) {
    for (const treeNodeId of new Set(participantToTreeId.values())) {
      const actor = updatedOwnerComp.actors?.find((a) => a.id === treeNodeId)
      if (actor) { if (!referencedNodeIds.includes(actor.uuid)) referencedNodeIds.push(actor.uuid); continue }
      const comp = updatedOwnerComp.subComponents?.find((c) => c.id === treeNodeId)
      if (comp && !referencedNodeIds.includes(comp.uuid)) referencedNodeIds.push(comp.uuid)
    }
  }

  // Update diagram node: merge use cases, resolve use-case UUIDs for referencedNodeIds
  updatedRoot = upsertNodeInTree(updatedRoot, diagramUuid, (node) => {
    const diagram = node as UseCaseDiagramNode
    const mergedUseCases = mergeLists(diagram.useCases ?? [], localUseCases)

    // Add use-case UUIDs to referencedNodeIds
    for (const ucId of localUseCaseIds) {
      const treeNodeId = participantToTreeId.get(ucId) ?? ucId
      const uc = mergedUseCases.find((u) => u.id === treeNodeId)
      if (uc && !referencedNodeIds.includes(uc.uuid)) referencedNodeIds.push(uc.uuid)
    }

    return { ...diagram, useCases: mergedUseCases, referencedNodeIds }
  })

  return updatedRoot
}
