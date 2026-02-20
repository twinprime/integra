import type {
  ComponentNode,
  ActorNode,
  UseCaseNode,
  UseCaseDiagramNode,
} from "../store/types"
import { upsertTree, mergeLists } from "./diagramParserHelpers"

// Regex patterns
const ACTOR_PATTERN = /actor\s+"([^"]+)"\s+as\s+(\w+)/g
const USE_CASE_PATTERN = /use case\s+"([^"]+)"\s+as\s+(\w+)/g

export function parseUseCaseDiagram(
  content: string,
  rootComponent: ComponentNode,
  ownerComponentUuid: string,
  diagramUuid: string
): ComponentNode {
  const parsedActorIds: string[] = []
  const parsedUseCaseIds: string[] = []

  // Parse Actors
  const newActors: ActorNode[] = []
  let match
  while ((match = ACTOR_PATTERN.exec(content)) !== null) {
    const [_, name, id] = match
    parsedActorIds.push(id)
    newActors.push({
      uuid: crypto.randomUUID(),
      id,
      name,
      type: "actor",
      description: `Actor ${name}`,
    })
  }

  // Parse Use Cases
  const newUseCases: UseCaseNode[] = []
  while ((match = USE_CASE_PATTERN.exec(content)) !== null) {
    const [_, name, id] = match
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

  // Update owner component with merged actors (actors stay at component level)
  let updatedRoot = upsertTree(rootComponent, ownerComponentUuid, (node) => {
    const comp = node as ComponentNode
    return {
      ...comp,
      actors: mergeLists(comp.actors || [], newActors),
    } as ComponentNode
  })

  // Resolve parsed ids to uuids using the updated tree
  const ownerComp = updatedRoot.subComponents.find((c) => c.uuid === ownerComponentUuid)
    ?? (updatedRoot.uuid === ownerComponentUuid ? updatedRoot : null)

  const referencedNodeIds: string[] = []
  if (ownerComp) {
    parsedActorIds.forEach((id) => {
      const actor = ownerComp.actors?.find((a) => a.id === id)
      if (actor) referencedNodeIds.push(actor.uuid)
    })
  }

  // Update diagram with use cases and referencedNodeIds (UUIDs)
  updatedRoot = upsertTree(updatedRoot, diagramUuid, (node) => {
    const diagram = node as UseCaseDiagramNode
    const mergedUseCases = mergeLists(diagram.useCases || [], newUseCases)
    // Resolve use case ids to uuids
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
