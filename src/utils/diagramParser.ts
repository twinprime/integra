import type {
  SystemNode,
  ComponentNode,
  ActorNode,
  UseCaseNode,
  Node,
} from "../store/types"

// Regex patterns
const ACTOR_PATTERN = /actor\s+"([^"]+)"\s+as\s+(\w+)/g
const USE_CASE_PATTERN = /use case\s+"([^"]+)"\s+as\s+(\w+)/g
// Sequence diagram patterns - support both actor/component with "as" keyword and simple names
const SEQ_ACTOR_PATTERN = /(?:^|\n)\s*actor\s+(?:"([^"]+)"\s+as\s+)?(\w+)/gm
const SEQ_COMPONENT_PATTERN = /(?:^|\n)\s*component\s+(?:"([^"]+)"\s+as\s+)?(\w+)/gm
const MESSAGE_PATTERN = /(\w+)\s*->>\s*(\w+)\s*:\s*(\w+)\(([^)]*)\)/g

// Helper to find a component (or system) by UUID
const findContainerInSystem = (
  system: SystemNode,
  uuid: string
): ComponentNode | SystemNode | null => {
  if (system.uuid === uuid) return system

  const findRecursive = (nodes: ComponentNode[]): ComponentNode | null => {
    for (const node of nodes) {
      if (node.uuid === uuid) return node
      const found = findRecursive(node.subComponents)
      if (found) return found
    }
    return null
  }

  return findRecursive(system.components)
}

export function parseUseCaseDiagram(
  content: string,
  system: SystemNode,
  parentUuid: string
): SystemNode {
  const parent = findContainerInSystem(system, parentUuid)
  if (!parent) return system

  // Parse Actors
  const newActors: ActorNode[] = []
  let match
  while ((match = ACTOR_PATTERN.exec(content)) !== null) {
    const [_, name, id] = match
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
    newUseCases.push({
      uuid: crypto.randomUUID(),
      id,
      name,
      type: "use-case",
      description: `Use Case ${name}`,
    })
  }

  // Helper to merge lists (update existing or append new)
  const mergeLists = <T extends { id: string; name: string }>(
    existing: T[],
    incoming: T[]
  ): T[] => {
    const result = [...existing]
    incoming.forEach((item) => {
      const index = result.findIndex((e) => e.id === item.id)
      if (index >= 0) {
        result[index] = { ...result[index], name: item.name }
      } else {
        result.push(item)
      }
    })
    return result
  }

  // Construct new state
  const updateParent = (
    node: ComponentNode | SystemNode
  ): ComponentNode | SystemNode => {
    return {
      ...node,
      actors: mergeLists(node.actors || [], newActors),
      useCases: mergeLists(node.useCases || [], newUseCases),
    } as ComponentNode | SystemNode
  }

  // Recursive update of system tree
  const updateTree = (node: Node): Node => {
    if (node.uuid === parent.uuid) {
      return updateParent(node as ComponentNode | SystemNode)
    }

    if (node.type === "system") {
      const sys = node as SystemNode
      return {
        ...sys,
        components: sys.components.map((c) => updateTree(c) as ComponentNode),
      }
    }

    if (node.type === "component") {
      const comp = node as ComponentNode
      return {
        ...comp,
        subComponents: comp.subComponents.map(
          (c) => updateTree(c) as ComponentNode
        ),
      }
    }
    return node
  }

  return updateTree(system) as SystemNode
}

export function parseSequenceDiagram(
  content: string,
  system: SystemNode,
  parentUuid: string
): SystemNode {
  const parent = findContainerInSystem(system, parentUuid)
  if (!parent) return system

  const participants: { uuid: string; id: string; name: string; type: string }[] = []
  const messages: {
    from: string
    to: string
    message: string
    params: string
  }[] = []

  let match
  // Parse Actors
  SEQ_ACTOR_PATTERN.lastIndex = 0
  while ((match = SEQ_ACTOR_PATTERN.exec(content)) !== null) {
    const name = match[1] || match[2] // name from quotes or just the id
    const id = match[2]
    if (!participants.find((p) => p.id === id.trim())) {
      participants.push({
        uuid: crypto.randomUUID(),
        id: id.trim(),
        name: name.trim(),
        type: "actor",
      })
    }
  }

  // Parse Components
  SEQ_COMPONENT_PATTERN.lastIndex = 0
  while ((match = SEQ_COMPONENT_PATTERN.exec(content)) !== null) {
    const name = match[1] || match[2] // name from quotes or just the id
    const id = match[2]
    if (!participants.find((p) => p.id === id.trim())) {
      participants.push({
        uuid: crypto.randomUUID(),
        id: id.trim(),
        name: name.trim(),
        type: "component",
      })
    }
  }

  // Parse Messages
  // Reset regex usage just in case, though they are local regex literals usually stateless unless 'g' is reused globally.
  // Const regex with 'g' IS stateful.
  MESSAGE_PATTERN.lastIndex = 0
  while ((match = MESSAGE_PATTERN.exec(content)) !== null) {
    messages.push({
      from: match[1],
      to: match[2],
      message: match[3],
      params: match[4],
    })
  }

  // Infer participants from messages (treat as components by default)
  messages.forEach((msg) => {
    if (!participants.find((p) => p.id === msg.from))
      participants.push({ uuid: crypto.randomUUID(), id: msg.from, name: msg.from, type: "component" })
    if (!participants.find((p) => p.id === msg.to))
      participants.push({ uuid: crypto.randomUUID(), id: msg.to, name: msg.to, type: "component" })
  })

  // Strategy: Calculate the NEW lists for the parent, then update tree.

  // 1. Identify Existing Components/Actors in Parent
  const existingComponents =
    parent.type === "system"
      ? (parent as SystemNode).components
      : (parent as ComponentNode).subComponents
  const existingActors = parent.actors || []

  // 2. Build Updated Lists
  const updatedComponents = [...existingComponents]
  const updatedActors = [...existingActors]

  participants.forEach((p) => {
    if (p.type === "actor") {
      if (!updatedActors.find((a) => a.id === p.id)) {
        updatedActors.push({
          uuid: p.uuid,
          id: p.id,
          name: p.name,
          type: "actor",
          description: "",
        })
      }
    } else {
      if (!updatedComponents.find((c) => c.id === p.id)) {
        updatedComponents.push({
          uuid: p.uuid,
          id: p.id,
          name: p.name,
          type: "component",
          description: "",
          subComponents: [],
          actors: [],
          useCases: [],
          useCaseDiagrams: [],
          sequenceDiagrams: [],
          interfaces: [],
        })
      }
    }
  })

  // 3. Add Interfaces to Components based on messages
  // We need to modify the components in 'updatedComponents' list.
  messages.forEach((msg) => {
    const targetCompIndex = updatedComponents.findIndex((c) => c.id === msg.to)
    if (targetCompIndex >= 0) {
      // Clone component to avoid mutation
      const targetComp = { ...updatedComponents[targetCompIndex] }

      // Interfaces
      const interfaces = targetComp.interfaces ? [...targetComp.interfaces] : []
      let defaultInterfaceIndex = interfaces.findIndex(
        (i) => i.name === "Default"
      )

      if (defaultInterfaceIndex === -1) {
        interfaces.push({
          id: `iface-${targetComp.id}-default`,
          name: "Default",
          type: "rest",
          interactions: [],
        })
        defaultInterfaceIndex = interfaces.length - 1
      }

      const defaultInterface = { ...interfaces[defaultInterfaceIndex] }
      const interactions = [...defaultInterface.interactions]

      if (!interactions.find((i) => i.id === msg.message)) {
        interactions.push({
          id: msg.message,
          description: `Generated from message ${msg.message}`,
          parameters: msg.params
            ? msg.params.split(",").map((p) => ({
                name: p.trim(),
                type: "string",
                required: true,
              }))
            : [],
        })
      }

      defaultInterface.interactions = interactions
      interfaces[defaultInterfaceIndex] = defaultInterface
      targetComp.interfaces = interfaces

      updatedComponents[targetCompIndex] = targetComp
    }
  })

  // 4. Update the Tree
  const updateTree = (node: Node): Node => {
    if (node.uuid === parent.uuid) {
      if (node.type === "system") {
        return {
          ...node,
          components: updatedComponents,
          actors: updatedActors,
        } as SystemNode
      } else {
        return {
          ...node,
          subComponents: updatedComponents,
          actors: updatedActors,
        } as ComponentNode
      }
    }

    if (node.type === "system") {
      return {
        ...node,
        components: (node as SystemNode).components.map(
          (c) => updateTree(c) as ComponentNode
        ),
      } as SystemNode
    }

    if (node.type === "component") {
      const comp = node as ComponentNode
      return {
        ...comp,
        subComponents: comp.subComponents.map(
          (c) => updateTree(c) as ComponentNode
        ),
      } as ComponentNode
    }

    return node
  }

  return updateTree(system) as SystemNode
}
