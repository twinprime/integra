import type {
  ComponentNode,
  ActorNode,
  UseCaseNode,
} from "../store/types"
import { findContainerInSystem, upsertTree, mergeLists } from "./diagramParserHelpers"

// Regex patterns
const ACTOR_PATTERN = /actor\s+"([^"]+)"\s+as\s+(\w+)/g
const USE_CASE_PATTERN = /use case\s+"([^"]+)"\s+as\s+(\w+)/g

export function parseUseCaseDiagram(
  content: string,
  rootComponent: ComponentNode,
  parentUuid: string,
  diagramUuid: string
): ComponentNode {
  const parent = findContainerInSystem(rootComponent, parentUuid)
  if (!parent) return rootComponent

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
    })
  }

  // Update parent component with merged actors and use cases
  let updatedRoot = upsertTree(rootComponent, parentUuid, (node) => {
    const comp = node as ComponentNode
    return {
      ...comp,
      actors: mergeLists(comp.actors || [], newActors),
      useCases: mergeLists(comp.useCases || [], newUseCases),
    } as ComponentNode
  })

  // Update diagram with referencedNodeIds
  updatedRoot = upsertTree(updatedRoot, diagramUuid, (node) => ({
    ...node,
    referencedNodeIds,
  }))

  return updatedRoot
}
