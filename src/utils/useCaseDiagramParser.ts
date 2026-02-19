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
  const referencedNodeIds: string[] = []

  // Parse Actors
  const newActors: ActorNode[] = []
  let match
  while ((match = ACTOR_PATTERN.exec(content)) !== null) {
    const [_, name, id] = match
    referencedNodeIds.push(id)
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
    referencedNodeIds.push(id)
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

  // Update diagram with use cases and referencedNodeIds
  updatedRoot = upsertTree(updatedRoot, diagramUuid, (node) => {
    const diagram = node as UseCaseDiagramNode
    return {
      ...diagram,
      useCases: mergeLists(diagram.useCases || [], newUseCases),
      referencedNodeIds,
    }
  })

  return updatedRoot
}
