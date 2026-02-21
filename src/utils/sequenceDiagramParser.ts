import type { ComponentNode, InterfaceSpecification, Parameter } from "../store/types"
import { upsertTree } from "./diagramParserHelpers"
import { findNodeByPath } from "./nodeUtils"

// Regex patterns - two simpler patterns per entity type, matched per line (no 'g' flag)
const SEQ_ACTOR_NAMED = /^\s*actor\s+"([^"]+)"\s+(?:from\s+([\w/-]+)\s+)?as\s+(\w+)/
const SEQ_ACTOR_BARE = /^\s*actor\s+(\w+)/
const SEQ_COMPONENT_NAMED = /^\s*component\s+"([^"]+)"\s+(?:from\s+([\w/-]+)\s+)?as\s+(\w+)/
const SEQ_COMPONENT_BARE = /^\s*component\s+(\w+)/
// New format: sender->>receiver: InterfaceId:functionId(param: type, param2: type2?)
const MESSAGE_PATTERN = /(\w+)\s*->>\s*(\w+)\s*:\s*(\w+):(\w+)\(([^)]*)\)/g

// Which side of the message owns the interface
const INTERFACE_TYPE_OWNER: Record<string, 'sender' | 'receiver'> = {
  kafka: 'sender',
  rest: 'receiver',
  graphql: 'receiver',
  other: 'receiver',
}

type ParticipantEntry = {
  uuid: string
  id: string
  name: string
  type: string
}

type MessageEntry = {
  from: string
  to: string
  interfaceId: string
  functionId: string
  params: string
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

function findFunctionUuidInTree(root: ComponentNode, interfaceId: string, functionId: string): string | null {
  const iface = root.interfaces?.find((i) => i.id === interfaceId)
  if (iface) {
    const fn = iface.functions.find((f) => f.id === functionId)
    if (fn) return fn.uuid
  }
  for (const sub of root.subComponents) {
    const found = findFunctionUuidInTree(sub, interfaceId, functionId)
    if (found) return found
  }
  return null
}

function resolveOwnerIndex(
  components: ComponentNode[],
  receiverIndex: number,
  senderIndex: number,
  interfaceId: string,
): number {
  const receiverIface = receiverIndex >= 0
    ? components[receiverIndex].interfaces?.find((i) => i.id === interfaceId)
    : undefined
  if (receiverIface) {
    return INTERFACE_TYPE_OWNER[receiverIface.type] === 'sender' ? senderIndex : receiverIndex
  }
  const senderIface = senderIndex >= 0
    ? components[senderIndex].interfaces?.find((i) => i.id === interfaceId)
    : undefined
  if (senderIface && INTERFACE_TYPE_OWNER[senderIface.type] === 'sender') {
    return senderIndex
  }
  return receiverIndex
}

function applyMessageToComponents(updatedComponents: ComponentNode[], msg: MessageEntry): ComponentNode[] {
  const result = [...updatedComponents]
  const receiverIndex = result.findIndex((c) => c.id === msg.to)
  const senderIndex = result.findIndex((c) => c.id === msg.from)

  const ownerIndex = resolveOwnerIndex(result, receiverIndex, senderIndex, msg.interfaceId)

  if (ownerIndex < 0) return result

  const targetComp = { ...result[ownerIndex] }
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
  result[ownerIndex] = targetComp
  return result
}

function findComponentByUuid(root: ComponentNode, uuid: string): ComponentNode | null {
  if (root.uuid === uuid) return root
  for (const sub of root.subComponents) {
    const found = findComponentByUuid(sub, uuid)
    if (found) return found
  }
  return null
}

type ParseState = {
  participants: ParticipantEntry[]
  parsedParticipantIds: string[]
  fromParticipantUuids: string[]
}

function parseParticipantLine(
  line: string,
  rootComponent: ComponentNode,
  type: "actor" | "component",
  state: ParseState,
): void {
  const namedPattern = type === "actor" ? SEQ_ACTOR_NAMED : SEQ_COMPONENT_NAMED
  const barePattern = type === "actor" ? SEQ_ACTOR_BARE : SEQ_COMPONENT_BARE

  const named = namedPattern.exec(line)
  if (named) {
    const [, name, fromPath, id] = named
    if (fromPath) {
      const uuid = findNodeByPath(rootComponent, fromPath)
      if (!uuid) throw new Error(`Cannot resolve ${type} "from" path: "${fromPath}"`)
      if (!state.fromParticipantUuids.includes(uuid)) state.fromParticipantUuids.push(uuid)
    } else {
      state.parsedParticipantIds.push(id.trim())
      if (!state.participants.some((p) => p.id === id.trim())) {
        state.participants.push({ uuid: crypto.randomUUID(), id: id.trim(), name: name.trim(), type })
      }
    }
    return
  }
  const bare = barePattern.exec(line)
  if (bare) {
    const id = bare[1]
    state.parsedParticipantIds.push(id.trim())
    if (!state.participants.some((p) => p.id === id.trim())) {
      state.participants.push({ uuid: crypto.randomUUID(), id: id.trim(), name: id.trim(), type })
    }
  }
}

function resolveReferencedNodeIds(
  ownerComp: ComponentNode | null,
  parsedParticipantIds: string[],
  fromParticipantUuids: string[],
): string[] {
  const ids = [...fromParticipantUuids]
  if (!ownerComp) return ids
  for (const id of parsedParticipantIds) {
    const actor = ownerComp.actors?.find((a) => a.id === id)
    if (actor) { ids.push(actor.uuid); continue }
    const comp = ownerComp.subComponents?.find((c) => c.id === id)
    if (comp) ids.push(comp.uuid)
  }
  return ids
}

function applyParticipantsToComponent(
  comp: ComponentNode,
  participants: ParticipantEntry[],
  messages: MessageEntry[],
): ComponentNode {
  let updatedComponents = [...comp.subComponents]
  const updatedActors = [...(comp.actors || [])]

  participants.forEach((p) => {
    if (p.type === "actor") {
      if (!updatedActors.some((a) => a.id === p.id)) {
        updatedActors.push({
          uuid: p.uuid,
          id: p.id,
          name: p.name,
          type: "actor",
          description: "",
        })
      }
    } else if (!updatedComponents.some((c) => c.id === p.id)) {
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
  })

  for (const msg of messages) {
    updatedComponents = applyMessageToComponents(updatedComponents, msg)
  }

  return {
    ...comp,
    subComponents: updatedComponents,
    actors: updatedActors,
  }
}

export function parseSequenceDiagram(
  content: string,
  rootComponent: ComponentNode,
  ownerComponentUuid: string,
  diagramUuid: string,
): ComponentNode {
  const parseState: ParseState = { participants: [], parsedParticipantIds: [], fromParticipantUuids: [] }
  const messages: MessageEntry[] = []

  for (const line of content.split('\n')) {
    parseParticipantLine(line, rootComponent, "actor", parseState)
    parseParticipantLine(line, rootComponent, "component", parseState)
  }

  MESSAGE_PATTERN.lastIndex = 0
  let match
  while ((match = MESSAGE_PATTERN.exec(content)) !== null) {
    messages.push({ from: match[1], to: match[2], interfaceId: match[3], functionId: match[4], params: match[5] })
  }

  let updatedRoot = upsertTree(rootComponent, ownerComponentUuid, (node) =>
    applyParticipantsToComponent(node as ComponentNode, parseState.participants, messages)
  )

  const ownerComp = findComponentByUuid(updatedRoot, ownerComponentUuid)
  const referencedNodeIds = resolveReferencedNodeIds(
    ownerComp, parseState.parsedParticipantIds, parseState.fromParticipantUuids
  )

  const referencedFunctionUuids: string[] = []
  for (const msg of messages) {
    const fnUuid = findFunctionUuidInTree(updatedRoot, msg.interfaceId, msg.functionId)
    if (fnUuid && !referencedFunctionUuids.includes(fnUuid)) referencedFunctionUuids.push(fnUuid)
  }

  updatedRoot = upsertTree(updatedRoot, diagramUuid, (node) => ({
    ...node, referencedNodeIds, referencedFunctionUuids,
  }))

  return updatedRoot
}
