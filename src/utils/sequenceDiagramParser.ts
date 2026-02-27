import type {
  ComponentNode,
  InterfaceSpecification,
  Parameter,
} from "../store/types"
import { upsertTree } from "./diagramParserHelpers"
import { findNodeByPath } from "./nodeUtils"

// Regex patterns - two simpler patterns per entity type, matched per line (no 'g' flag)
const SEQ_ACTOR_NAMED =
  /^\s*actor\s+"([^"]+)"\s+(?:from\s+([\w/-]+)\s+)?as\s+(\w+)/
const SEQ_ACTOR_BARE = /^\s*actor\s+(\w+)/
const SEQ_COMPONENT_NAMED =
  /^\s*component\s+"([^"]+)"\s+(?:from\s+([\w/-]+)\s+)?as\s+(\w+)/
const SEQ_COMPONENT_BARE = /^\s*component\s+(\w+)/
// New format: sender->>receiver: InterfaceId:functionId(param: type, param2: type2?)
// Negative lookahead excludes UseCase: prefix (reserved for use-case message references)
const MESSAGE_PATTERN = /(\w+)\s*->>\s*(\w+)\s*:\s*(?!UseCase:)(\w+):(\w+)\(([^)]*)\)/g
// Use-case reference: sender->>receiver: UseCase:useCaseId
const USE_CASE_MESSAGE_PATTERN = /(\w+)\s*->>\s*(\w+)\s*:\s*UseCase:(\w+)/g

// Which side of the message owns the interface
const INTERFACE_TYPE_OWNER: Record<string, "sender" | "receiver"> = {
  kafka: "sender",
  rest: "receiver",
  graphql: "receiver",
  other: "receiver",
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

type UseCaseMessageEntry = {
  from: string
  to: string
  useCaseId: string
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
  return a.every(
    (p, i) =>
      p.name === b[i].name &&
      p.type === b[i].type &&
      p.required === b[i].required,
  )
}

export function paramsToString(params: Parameter[]): string {
  return params
    .map((p) => `${p.name}: ${p.type}${p.required ? "" : "?"}`)
    .join(", ")
}

export type FunctionMatch = {
  kind: "compatible" | "incompatible"
  interfaceId: string
  functionId: string
  functionUuid: string
  oldParams: Parameter[]
  newParams: Parameter[]
  /** UUIDs of sequence diagrams (excluding current) that reference this function */
  affectedDiagramUuids: string[]
}

function findFunctionInTree(
  root: ComponentNode,
  interfaceId: string,
  functionId: string,
): { uuid: string; parameters: Parameter[] } | null {
  const iface = root.interfaces?.find((i) => i.id === interfaceId)
  if (iface) {
    const fn = iface.functions.find((f) => f.id === functionId)
    if (fn) return { uuid: fn.uuid, parameters: fn.parameters }
  }
  for (const sub of root.subComponents) {
    const found = findFunctionInTree(sub, interfaceId, functionId)
    if (found) return found
  }
  return null
}

function findFunctionUuidInTree(
  root: ComponentNode,
  interfaceId: string,
  functionId: string,
): string | null {
  const found = findFunctionInTree(root, interfaceId, functionId)
  return found ? found.uuid : null
}

function resolveOwnerIndex(
  components: ComponentNode[],
  receiverIndex: number,
  senderIndex: number,
  interfaceId: string,
): number {
  const receiverIface =
    receiverIndex >= 0
      ? components[receiverIndex].interfaces?.find((i) => i.id === interfaceId)
      : undefined
  if (receiverIface) {
    return INTERFACE_TYPE_OWNER[receiverIface.type] === "sender"
      ? senderIndex
      : receiverIndex
  }
  const senderIface =
    senderIndex >= 0
      ? components[senderIndex].interfaces?.find((i) => i.id === interfaceId)
      : undefined
  if (senderIface && INTERFACE_TYPE_OWNER[senderIface.type] === "sender") {
    return senderIndex
  }
  return receiverIndex
}

function applyMessageToComponents(
  updatedComponents: ComponentNode[],
  msg: MessageEntry,
): ComponentNode[] {
  const result = [...updatedComponents]
  const receiverIndex = result.findIndex((c) => c.id === msg.to)
  const senderIndex = result.findIndex((c) => c.id === msg.from)

  const ownerIndex = resolveOwnerIndex(
    result,
    receiverIndex,
    senderIndex,
    msg.interfaceId,
  )

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

  const iface = {
    ...interfaces[ifaceIndex],
    functions: [...interfaces[ifaceIndex].functions],
  }
  const newParams = parseParameters(msg.params)
  const exactMatchIdx = iface.functions.findIndex(
    (f) => f.id === msg.functionId && paramsMatch(f.parameters, newParams),
  )

  if (exactMatchIdx === -1) {
    const sameIdSameCount = iface.functions.find(
      (f) =>
        f.id === msg.functionId && f.parameters.length === newParams.length,
    )
    if (sameIdSameCount) {
      const existingStr = paramsToString(sameIdSameCount.parameters)
      const newStr = paramsToString(newParams)
      throw new Error(
        `Parameter mismatch for function "${msg.functionId}" in interface "${msg.interfaceId}": ` +
          `existing (${existingStr}) vs new (${newStr})`,
      )
    }
    iface.functions.push({
      uuid: crypto.randomUUID(),
      id: msg.functionId,
      parameters: newParams,
    })
  }

  interfaces[ifaceIndex] = iface
  targetComp.interfaces = interfaces
  result[ownerIndex] = targetComp
  return result
}

function findComponentByUuid(
  root: ComponentNode,
  uuid: string,
): ComponentNode | null {
  if (root.uuid === uuid) return root
  for (const sub of root.subComponents) {
    const found = findComponentByUuid(sub, uuid)
    if (found) return found
  }
  return null
}

function findUseCaseInComponent(comp: ComponentNode, useCaseId: string): string | undefined {
  for (const d of comp.useCaseDiagrams) {
    const uc = d.useCases.find((u) => u.id === useCaseId)
    if (uc) return uc.uuid
  }
  return undefined
}

type ParseState = {
  participants: ParticipantEntry[]
  parsedParticipantIds: string[]
  fromParticipantUuids: string[]
}

function addParticipantIfNew(
  state: ParseState,
  id: string,
  name: string,
  type: "actor" | "component",
): void {
  const trimmedId = id.trim()
  state.parsedParticipantIds.push(trimmedId)
  if (!state.participants.some((p) => p.id === trimmedId)) {
    state.participants.push({ uuid: crypto.randomUUID(), id: trimmedId, name: name.trim(), type })
  }
}

function resolveFromPath(state: ParseState, rootComponent: ComponentNode, fromPath: string, type: string): void {
  const uuid = findNodeByPath(rootComponent, fromPath)
  if (!uuid) throw new Error(`Cannot resolve ${type} "from" path: "${fromPath}"`)
  if (!state.fromParticipantUuids.includes(uuid)) state.fromParticipantUuids.push(uuid)
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
      resolveFromPath(state, rootComponent, fromPath, type)
    } else {
      addParticipantIfNew(state, id, name, type)
    }
    return
  }
  const bare = barePattern.exec(line)
  if (bare) {
    addParticipantIfNew(state, bare[1], bare[1], type)
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
    if (actor) {
      ids.push(actor.uuid)
      continue
    }
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

export function analyzeSequenceDiagramChanges(
  content: string,
  rootComponent: ComponentNode,
  diagramUuid: string,
  allSeqDiagrams: Array<{ uuid: string; referencedFunctionUuids: string[] }>,
): FunctionMatch[] {
  const otherRefs = new Set(
    allSeqDiagrams
      .filter((d) => d.uuid !== diagramUuid)
      .flatMap((d) => d.referencedFunctionUuids),
  )

  MESSAGE_PATTERN.lastIndex = 0
  const matches: FunctionMatch[] = []
  const seen = new Set<string>()
  let match

  while ((match = MESSAGE_PATTERN.exec(content)) !== null) {
    const interfaceId = match[3]
    const functionId = match[4]
    const rawParams = match[5]
    const key = `${interfaceId}:${functionId}`

    if (seen.has(key)) continue
    seen.add(key)

    const newParams = parseParameters(rawParams)
    const existing = findFunctionInTree(rootComponent, interfaceId, functionId)

    if (!existing) continue
    if (paramsMatch(existing.parameters, newParams)) continue

    const kind =
      existing.parameters.length === newParams.length
        ? "incompatible"
        : "compatible"

    const affectedDiagramUuids = allSeqDiagrams
      .filter(
        (d) =>
          d.uuid !== diagramUuid &&
          d.referencedFunctionUuids.includes(existing.uuid),
      )
      .map((d) => d.uuid)

    // Incompatible + exclusively owned: handled silently by stripExclusiveFunctionContributions
    if (kind === "incompatible" && !otherRefs.has(existing.uuid)) continue

    matches.push({
      kind,
      interfaceId,
      functionId,
      functionUuid: existing.uuid,
      oldParams: existing.parameters,
      newParams,
      affectedDiagramUuids,
    })
  }

  return matches
}

export function parseSequenceDiagram(
  content: string,
  rootComponent: ComponentNode,
  ownerComponentUuid: string,
  diagramUuid: string,
): ComponentNode {
  const parseState: ParseState = {
    participants: [],
    parsedParticipantIds: [],
    fromParticipantUuids: [],
  }
  const messages: MessageEntry[] = []
  const useCaseMessages: UseCaseMessageEntry[] = []

  for (const line of content.split("\n")) {
    parseParticipantLine(line, rootComponent, "actor", parseState)
    parseParticipantLine(line, rootComponent, "component", parseState)
  }

  MESSAGE_PATTERN.lastIndex = 0
  let match
  while ((match = MESSAGE_PATTERN.exec(content)) !== null) {
    messages.push({
      from: match[1],
      to: match[2],
      interfaceId: match[3],
      functionId: match[4],
      params: match[5],
    })
  }

  USE_CASE_MESSAGE_PATTERN.lastIndex = 0
  while ((match = USE_CASE_MESSAGE_PATTERN.exec(content)) !== null) {
    useCaseMessages.push({ from: match[1], to: match[2], useCaseId: match[3] })
  }

  let updatedRoot = upsertTree(rootComponent, ownerComponentUuid, (node) =>
    applyParticipantsToComponent(
      node as ComponentNode,
      parseState.participants,
      messages,
    ),
  )

  const ownerComp = findComponentByUuid(updatedRoot, ownerComponentUuid)
  const referencedNodeIds = resolveReferencedNodeIds(
    ownerComp,
    parseState.parsedParticipantIds,
    parseState.fromParticipantUuids,
  )

  // Resolve use-case message references into referencedNodeIds
  if (ownerComp) {
    for (const msg of useCaseMessages) {
      const receiverComp = ownerComp.subComponents.find((c) => c.id === msg.to)
      if (!receiverComp) continue
      const ucUuid = findUseCaseInComponent(receiverComp, msg.useCaseId)
      if (ucUuid && !referencedNodeIds.includes(ucUuid)) referencedNodeIds.push(ucUuid)
    }
  }

  const referencedFunctionUuids: string[] = []
  for (const msg of messages) {
    const fnUuid = findFunctionUuidInTree(
      updatedRoot,
      msg.interfaceId,
      msg.functionId,
    )
    if (fnUuid && !referencedFunctionUuids.includes(fnUuid))
      referencedFunctionUuids.push(fnUuid)
  }

  updatedRoot = upsertTree(updatedRoot, diagramUuid, (node) => ({
    ...node,
    referencedNodeIds,
    referencedFunctionUuids,
  }))

  return updatedRoot
}
