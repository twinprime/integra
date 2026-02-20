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

export function parseUseCaseDiagram(
  content: string,
  rootComponent: ComponentNode,
  ownerComponentUuid: string,
  diagramUuid: string
): ComponentNode {
  const parsedActorIds: string[] = []
  const parsedComponentIds: string[] = []
  const parsedUseCaseIds: string[] = []

  // Parse Actors
  const newActors: ActorNode[] = []
  const fromActorUuids: string[] = []
  let match
  while ((match = ACTOR_PATTERN.exec(content)) !== null) {
    const [_, name, fromPath, id] = match
    if (fromPath) {
      const uuid = findNodeByPath(rootComponent, fromPath)
      if (!uuid) throw new Error(`Cannot resolve actor "from" path: "${fromPath}"`)
      fromActorUuids.push(uuid)
    } else {
      parsedActorIds.push(id)
      newActors.push({
        uuid: crypto.randomUUID(),
        id,
        name,
        type: "actor",
        description: `Actor ${name}`,
      })
    }
  }

  // Parse Components
  const newComponents: ComponentNode[] = []
  const fromComponentUuids: string[] = []
  while ((match = COMPONENT_PATTERN.exec(content)) !== null) {
    const [_, name, fromPath, id] = match
    if (fromPath) {
      const uuid = findNodeByPath(rootComponent, fromPath)
      if (!uuid) throw new Error(`Cannot resolve component "from" path: "${fromPath}"`)
      fromComponentUuids.push(uuid)
    } else {
      parsedComponentIds.push(id)
      newComponents.push({
        uuid: crypto.randomUUID(),
        id,
        name,
        type: "component",
        description: "",
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
      })
    }
  }

  // Parse Use Cases
  const newUseCases: UseCaseNode[] = []
  const fromUseCaseUuids: string[] = []
  while ((match = USE_CASE_PATTERN.exec(content)) !== null) {
    const [_, name, fromPath, id] = match
    if (fromPath) {
      const uuid = findNodeByPath(rootComponent, fromPath)
      if (!uuid) throw new Error(`Cannot resolve use case "from" path: "${fromPath}"`)
      fromUseCaseUuids.push(uuid)
    } else {
      parsedUseCaseIds.push(id)
      newUseCases.push({
        uuid: crypto.randomUUID(),
        id,
        name,
        type: "use-case",
        description: `Use Case ${name}`,
        sequenceDiagrams: [],
      })
    }
  }

  // Update owner component with merged actors and components
  let updatedRoot = upsertTree(rootComponent, ownerComponentUuid, (node) => {
    const comp = node as ComponentNode
    return {
      ...comp,
      actors: mergeLists(comp.actors || [], newActors),
      subComponents: mergeLists(comp.subComponents || [], newComponents),
    } as ComponentNode
  })

  // Resolve parsed ids to uuids using the updated tree
  const findOwnerComp = (c: ComponentNode): ComponentNode | null => {
    if (c.uuid === ownerComponentUuid) return c
    for (const sub of c.subComponents) {
      const found = findOwnerComp(sub)
      if (found) return found
    }
    return null
  }
  const ownerComp = findOwnerComp(updatedRoot)

  const referencedNodeIds: string[] = [...fromActorUuids, ...fromComponentUuids, ...fromUseCaseUuids]
  if (ownerComp) {
    parsedActorIds.forEach((id) => {
      const actor = ownerComp.actors?.find((a) => a.id === id)
      if (actor) referencedNodeIds.push(actor.uuid)
    })
    parsedComponentIds.forEach((id) => {
      const comp = ownerComp.subComponents?.find((c) => c.id === id)
      if (comp) referencedNodeIds.push(comp.uuid)
    })
  }

  // Update diagram with use cases and referencedNodeIds (UUIDs)
  updatedRoot = upsertTree(updatedRoot, diagramUuid, (node) => {
    const diagram = node as UseCaseDiagramNode
    const mergedUseCases = mergeLists(diagram.useCases || [], newUseCases)
    parsedUseCaseIds.forEach((id) => {
      const uc = mergedUseCases.find((u) => u.id === id)
      if (uc && !referencedNodeIds.includes(uc.uuid)) referencedNodeIds.push(uc.uuid)
    })
    return {
      ...diagram,
      useCases: mergedUseCases,
      referencedNodeIds,
    }
  })

  return updatedRoot
}
