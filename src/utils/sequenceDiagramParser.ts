import type { ComponentNode } from "../store/types"
import { findContainerInSystem, upsertTree } from "./diagramParserHelpers"

// Regex patterns
const SEQ_ACTOR_PATTERN = /(?:^|\n)\s*actor\s+(?:"([^"]+)"\s+as\s+)?(\w+)/gm
const SEQ_COMPONENT_PATTERN = /(?:^|\n)\s*component\s+(?:"([^"]+)"\s+as\s+)?(\w+)/gm
const MESSAGE_PATTERN = /(\w+)\s*->>\s*(\w+)\s*:\s*(\w+)\(([^)]*)\)/g

export function parseSequenceDiagram(
  content: string,
  rootComponent: ComponentNode,
  parentUuid: string,
  diagramUuid: string
): ComponentNode {
  const parent = findContainerInSystem(rootComponent, parentUuid)
  if (!parent) return rootComponent

  const participants: { uuid: string; id: string; name: string; type: string }[] = []
  const referencedNodeIds: string[] = []
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
    referencedNodeIds.push(id.trim())
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
    referencedNodeIds.push(id.trim())
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
    if (!participants.find((p) => p.id === msg.from)) {
      referencedNodeIds.push(msg.from)
      participants.push({ uuid: crypto.randomUUID(), id: msg.from, name: msg.from, type: "component" })
    }
    if (!participants.find((p) => p.id === msg.to)) {
      referencedNodeIds.push(msg.to)
      participants.push({ uuid: crypto.randomUUID(), id: msg.to, name: msg.to, type: "component" })
    }
  })

  // 1. Identify Existing Components/Actors in Parent
  const existingComponents = parent.subComponents
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
  // First update the parent component with new actors and components
  let updatedRoot = upsertTree(rootComponent, parentUuid, (node) => ({
    ...node,
    subComponents: updatedComponents,
    actors: updatedActors,
  } as ComponentNode))

  // Then update the diagram with referencedNodeIds
  updatedRoot = upsertTree(updatedRoot, diagramUuid, (node) => ({
    ...node,
    referencedNodeIds,
  }))

  return updatedRoot
}
