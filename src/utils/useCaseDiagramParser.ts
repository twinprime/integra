import type {
  ComponentNode,
  ActorNode,
  UseCaseNode,
  UseCaseDiagramNode,
} from "../store/types"
import { upsertTree, mergeLists } from "./diagramParserHelpers"
import { findNodeByPath } from "./nodeUtils"

// Regex patterns — optional "from <path>" clause between name and "as"
const ACTOR_PATTERN = /actor\s+"([^"]+)"(?:\s+from\s+([\w\-/]+))?\s+as\s+(\w+)/g
const COMPONENT_PATTERN = /component\s+"([^"]+)"(?:\s+from\s+([\w\-/]+))?\s+as\s+(\w+)/g
const USE_CASE_PATTERN = /use case\s+"([^"]+)"(?:\s+from\s+([\w\-/]+))?\s+as\s+(\w+)/g

type ParsedEntities<T> = { items: T[]; fromUuids: string[]; ids: string[] }

function parsePattern<T>(
  pattern: RegExp,
  content: string,
  rootComponent: ComponentNode,
  entityLabel: string,
  createItem: (id: string, name: string) => T,
): ParsedEntities<T> {
  const items: T[] = []
  const fromUuids: string[] = []
  const ids: string[] = []
  let match
  while ((match = pattern.exec(content)) !== null) {
    const [, name, fromPath, id] = match
    if (fromPath) {
      const uuid = findNodeByPath(rootComponent, fromPath)
      if (!uuid) throw new Error(`Cannot resolve ${entityLabel} "from" path: "${fromPath}"`)
      fromUuids.push(uuid)
    } else {
      ids.push(id)
      items.push(createItem(id, name))
    }
  }
  return { items, fromUuids, ids }
}

export function parseUseCaseDiagram(
  content: string,
  rootComponent: ComponentNode,
  ownerComponentUuid: string,
  diagramUuid: string
): ComponentNode {
  const actors = parsePattern<ActorNode>(ACTOR_PATTERN, content, rootComponent, "actor",
    (id, name) => ({ uuid: crypto.randomUUID(), id, name, type: "actor", description: `Actor ${name}` }),
  )
  const components = parsePattern<ComponentNode>(COMPONENT_PATTERN, content, rootComponent, "component",
    (id, name) => ({ uuid: crypto.randomUUID(), id, name, type: "component", description: "", subComponents: [], actors: [], useCaseDiagrams: [], interfaces: [] }),
  )
  const useCases = parsePattern<UseCaseNode>(USE_CASE_PATTERN, content, rootComponent, "use case",
    (id, name) => ({ uuid: crypto.randomUUID(), id, name, type: "use-case", description: `Use Case ${name}`, sequenceDiagrams: [] }),
  )

  // Update owner component with merged actors and sub-components
  let updatedRoot = upsertTree(rootComponent, ownerComponentUuid, (node) => {
    const comp = node as ComponentNode
    return {
      ...comp,
      actors: mergeLists(comp.actors || [], actors.items),
      subComponents: mergeLists(comp.subComponents || [], components.items),
    } as ComponentNode
  })

  // Resolve parsed ids → uuids in the updated tree
  const findOwnerComp = (c: ComponentNode): ComponentNode | null => {
    if (c.uuid === ownerComponentUuid) return c
    for (const sub of c.subComponents) {
      const found = findOwnerComp(sub)
      if (found) return found
    }
    return null
  }
  const ownerComp = findOwnerComp(updatedRoot)

  const referencedNodeIds: string[] = [...actors.fromUuids, ...components.fromUuids, ...useCases.fromUuids]
  if (ownerComp) {
    actors.ids.forEach((id) => {
      const actor = ownerComp.actors?.find((a) => a.id === id)
      if (actor) referencedNodeIds.push(actor.uuid)
    })
    components.ids.forEach((id) => {
      const comp = ownerComp.subComponents?.find((c) => c.id === id)
      if (comp) referencedNodeIds.push(comp.uuid)
    })
  }

  // Update diagram with use cases and referencedNodeIds
  updatedRoot = upsertTree(updatedRoot, diagramUuid, (node) => {
    const diagram = node as UseCaseDiagramNode
    const mergedUseCases = mergeLists(diagram.useCases || [], useCases.items)
    useCases.ids.forEach((id) => {
      const uc = mergedUseCases.find((u) => u.id === id)
      if (uc && !referencedNodeIds.includes(uc.uuid)) referencedNodeIds.push(uc.uuid)
    })
    return { ...diagram, useCases: mergedUseCases, referencedNodeIds }
  })

  return updatedRoot
}
