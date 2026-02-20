import type { ComponentNode, InterfaceSpecification, Parameter } from "../store/types"
import { upsertTree } from "./diagramParserHelpers"
import { findNodeByPath } from "./nodeUtils"

// Regex patterns
// actor "Name" [from <path>] as <id>  OR  actor <id>
const SEQ_ACTOR_PATTERN = /(?:^|\n)\s*actor\s+(?:"([^"]+)"\s+(?:from\s+([\w\-/]+)\s+)?as\s+(\w+)|(\w+))/gm
// component "Name" [from <path>] as <id>  OR  component <id>
const SEQ_COMPONENT_PATTERN = /(?:^|\n)\s*component\s+(?:"([^"]+)"\s+(?:from\s+([\w\-/]+)\s+)?as\s+(\w+)|(\w+))/gm
// New format: sender->>receiver: InterfaceId:functionId(param: type, param2: type2?)
const MESSAGE_PATTERN = /(\w+)\s*->>\s*(\w+)\s*:\s*(\w+):(\w+)\(([^)]*)\)/g

// Which side of the message owns the interface
const INTERFACE_TYPE_OWNER: Record<string, 'sender' | 'receiver'> = {
  kafka: 'sender',
  rest: 'receiver',
  graphql: 'receiver',
  other: 'receiver',
}

function parseParameters(rawParams: string): Parameter[] {
  if (!rawParams.trim()) return []
  return rawParams.split(",").map((p) => {
    const trimmed = p.trim()
    const colonIdx = trimmed.indexOf(":")
    if (colonIdx === -1) {
      return { name: trimmed, type: "any", required: true }
    }
    const name = trimmed.slice(0, colonIdx).trim()
    const rawType = trimmed.slice(colonIdx + 1).trim()
    const optional = rawType.endsWith("?")
    const type = optional ? rawType.slice(0, -1).trim() : rawType
    return { name, type: type || "any", required: !optional }
  })
}

function paramsMatch(a: Parameter[], b: Parameter[]): boolean {
  if (a.length !== b.length) return false
  return a.every((p, i) => p.name === b[i].name && p.type === b[i].type && p.required === b[i].required)
}

export function parseSequenceDiagram(
  content: string,
  rootComponent: ComponentNode,
  ownerComponentUuid: string,
  diagramUuid: string,
): ComponentNode {
  const participants: {
    uuid: string
    id: string
    name: string
    type: string
  }[] = []
  const parsedParticipantIds: string[] = []
  // UUIDs resolved from "from" clause references (no upsert)
  const fromParticipantUuids: string[] = []
  const messages: {
    from: string
    to: string
    interfaceId: string
    functionId: string
    params: string
  }[] = []

  let match
  // Parse Actors
  // Groups: [1]=name, [2]=fromPath, [3]=id (named), [4]=id (bare)
  SEQ_ACTOR_PATTERN.lastIndex = 0
  while ((match = SEQ_ACTOR_PATTERN.exec(content)) !== null) {
    const name = match[1] || match[4]
    const fromPath = match[2]
    const id = match[3] || match[4]
    if (!id) continue
    if (fromPath) {
      const uuid = findNodeByPath(rootComponent, fromPath)
      if (uuid && !fromParticipantUuids.includes(uuid)) fromParticipantUuids.push(uuid)
    } else {
      parsedParticipantIds.push(id.trim())
      if (!participants.find((p) => p.id === id.trim())) {
        participants.push({
          uuid: crypto.randomUUID(),
          id: id.trim(),
          name: (name || id).trim(),
          type: "actor",
        })
      }
    }
  }

  // Parse Components
  // Groups: [1]=name, [2]=fromPath, [3]=id (named), [4]=id (bare)
  SEQ_COMPONENT_PATTERN.lastIndex = 0
  while ((match = SEQ_COMPONENT_PATTERN.exec(content)) !== null) {
    const name = match[1] || match[4]
    const fromPath = match[2]
    const id = match[3] || match[4]
    if (!id) continue
    if (fromPath) {
      const uuid = findNodeByPath(rootComponent, fromPath)
      if (uuid && !fromParticipantUuids.includes(uuid)) fromParticipantUuids.push(uuid)
    } else {
      parsedParticipantIds.push(id.trim())
      if (!participants.find((p) => p.id === id.trim())) {
        participants.push({
          uuid: crypto.randomUUID(),
          id: id.trim(),
          name: (name || id).trim(),
          type: "component",
        })
      }
    }
  }

  // Parse Messages (new format: sender->>receiver: InterfaceId:functionId(params))
  MESSAGE_PATTERN.lastIndex = 0
  while ((match = MESSAGE_PATTERN.exec(content)) !== null) {
    messages.push({
      from: match[1],
      to: match[2],
      interfaceId: match[3],
      functionId: match[4],
      params: match[5],
    })
  }

  // Update the owning component with new actors, components, and interfaces
  let updatedRoot = upsertTree(rootComponent, ownerComponentUuid, (node) => {
    const comp = node as ComponentNode

    // Build updated lists
    const updatedComponents = [...comp.subComponents]
    const updatedActors = [...(comp.actors || [])]

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
            useCaseDiagrams: [],
            interfaces: [],
          })
        }
      }
    })

    // Add/update Interfaces on Components based on messages
    messages.forEach((msg) => {
      // Determine which component owns the interface based on interface type lookup
      const receiverIndex = updatedComponents.findIndex((c) => c.id === msg.to)
      const senderIndex = updatedComponents.findIndex((c) => c.id === msg.from)

      // Default owner is the receiver
      let ownerIndex = receiverIndex

      // Check receiver first for an existing interface
      const receiverIface = receiverIndex >= 0
        ? updatedComponents[receiverIndex].interfaces?.find((i) => i.id === msg.interfaceId)
        : undefined

      if (receiverIface) {
        // Receiver has it — if it's a sender-owned type (e.g. kafka), reassign to sender
        if (INTERFACE_TYPE_OWNER[receiverIface.type] === 'sender') {
          ownerIndex = senderIndex
        }
      } else {
        // Receiver doesn't have it — check if sender already owns it
        const senderIface = senderIndex >= 0
          ? updatedComponents[senderIndex].interfaces?.find((i) => i.id === msg.interfaceId)
          : undefined
        if (senderIface && INTERFACE_TYPE_OWNER[senderIface.type] === 'sender') {
          ownerIndex = senderIndex
        }
      }

      if (ownerIndex < 0) return

      const targetComp = { ...updatedComponents[ownerIndex] }
      const interfaces: InterfaceSpecification[] = targetComp.interfaces
        ? [...targetComp.interfaces]
        : []

      let ifaceIndex = interfaces.findIndex((i) => i.id === msg.interfaceId)
      if (ifaceIndex === -1) {
        interfaces.push({
          uuid: crypto.randomUUID(),
          id: msg.interfaceId,
          name: msg.interfaceId,
          type: "rest",
          functions: [],
        })
        ifaceIndex = interfaces.length - 1
      }

      const iface = { ...interfaces[ifaceIndex], functions: [...interfaces[ifaceIndex].functions] }
      const existingFnIdx = iface.functions.findIndex((f) => f.id === msg.functionId)
      const newParams = parseParameters(msg.params)

      if (existingFnIdx === -1) {
        iface.functions.push({
          uuid: crypto.randomUUID(),
          id: msg.functionId,
          parameters: newParams,
        })
      } else {
        const existingFn = iface.functions[existingFnIdx]
        if (!paramsMatch(existingFn.parameters, newParams)) {
          const existingStr = existingFn.parameters.map(p => `${p.name}: ${p.type}${p.required ? '' : '?'}`).join(', ')
          const newStr = newParams.map(p => `${p.name}: ${p.type}${p.required ? '' : '?'}`).join(', ')
          throw new Error(
            `Parameter mismatch for function "${msg.functionId}" in interface "${msg.interfaceId}": ` +
            `existing (${existingStr}) vs new (${newStr})`
          )
        }
      }

      interfaces[ifaceIndex] = iface
      targetComp.interfaces = interfaces
      updatedComponents[ownerIndex] = targetComp
    })

    return {
      ...comp,
      subComponents: updatedComponents,
      actors: updatedActors,
    } as ComponentNode
  })

  // Resolve participant ids to uuids using the updated tree
  const ownerComp = (function findComp(c: ComponentNode): ComponentNode | null {
    if (c.uuid === ownerComponentUuid) return c
    for (const sub of c.subComponents) {
      const found = findComp(sub)
      if (found) return found
    }
    return null
  })(updatedRoot)

  const referencedNodeIds: string[] = [...fromParticipantUuids]
  if (ownerComp) {
    parsedParticipantIds.forEach((id) => {
      const actor = ownerComp.actors?.find((a) => a.id === id)
      if (actor) { referencedNodeIds.push(actor.uuid); return }
      const comp = ownerComp.subComponents?.find((c) => c.id === id)
      if (comp) referencedNodeIds.push(comp.uuid)
    })
  }

  // Collect referencedFunctionUuids from all messages
  const referencedFunctionUuids: string[] = []
  messages.forEach((msg) => {
    const findFunctionUuid = (root: ComponentNode): string | null => {
      const checkComp = (c: ComponentNode): string | null => {
        const iface = c.interfaces?.find((i) => i.id === msg.interfaceId)
        if (iface) {
          const fn = iface.functions.find((f) => f.id === msg.functionId)
          if (fn) return fn.uuid
        }
        for (const sub of c.subComponents) {
          const found = checkComp(sub)
          if (found) return found
        }
        return null
      }
      return checkComp(root)
    }
    const fnUuid = findFunctionUuid(updatedRoot)
    if (fnUuid && !referencedFunctionUuids.includes(fnUuid)) {
      referencedFunctionUuids.push(fnUuid)
    }
  })

  // Update the diagram with referencedNodeIds and referencedFunctionUuids
  updatedRoot = upsertTree(updatedRoot, diagramUuid, (node) => ({
    ...node,
    referencedNodeIds,
    referencedFunctionUuids,
  }))

  return updatedRoot
}
