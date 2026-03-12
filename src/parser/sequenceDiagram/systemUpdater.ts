/**
 * systemUpdater.ts — replaces src/utils/sequenceDiagramParser.ts
 *
 * Parses sequence diagram DSL content using the Chevrotain-based parser and
 * updates the component tree accordingly.
 */
import type { ComponentNode, InterfaceSpecification, Parameter } from "../../store/types"
import { upsertNodeInTree, mergeLists } from "../../nodes/nodeTree"
import { findCompByUuid } from "../../nodes/nodeTree"
import { findNodeByPath, isInScope } from "../../utils/nodeUtils"
import { resolveUseCaseByPath, resolveSeqDiagramByPath, autoCreateByPath } from "../../utils/diagramResolvers"
import { parseSequenceDiagramCst } from "./parser"
import { buildSeqAst, flattenMessages } from "./visitor"
import { deriveNameFromId } from "../../utils/nameUtils"

// ─── Shared utilities (re-exported for callers) ───────────────────────────────

export function parseParameters(rawParams: string): Parameter[] {
  if (!rawParams.trim()) return []
  return rawParams.split(",").map((p) => {
    const trimmed = p.trim()
    const colonIdx = trimmed.indexOf(":")
    if (colonIdx === -1) return { name: trimmed, type: "any", required: true }
    const name = trimmed.slice(0, colonIdx).trim()
    const rawType = trimmed.slice(colonIdx + 1).trim()
    const optional = rawType.endsWith("?")
    const type = optional ? rawType.slice(0, -1).trim() : rawType
    return { name, type: type || "any", required: !optional }
  })
}

export function paramsToString(params: Parameter[]): string {
  return params.map((p) => `${p.name}: ${p.type}${p.required ? "" : "?"}`).join(", ")
}

function paramsMatch(a: Parameter[], b: Parameter[]): boolean {
  if (a.length !== b.length) return false
  return a.every((p, i) => p.name === b[i].name && p.type === b[i].type && p.required === b[i].required)
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type FunctionMatch = {
  kind: "compatible" | "incompatible"
  interfaceId: string
  functionId: string
  functionUuid: string
  oldParams: Parameter[]
  newParams: Parameter[]
  affectedDiagramUuids: string[]
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Recursively extract all SeqMessage nodes from a statement list (including inside blocks). */


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

function findFunctionUuidInTree(root: ComponentNode, interfaceId: string, functionId: string): string | null {
  return findFunctionInTree(root, interfaceId, functionId)?.uuid ?? null
}

/**
 * Walks the full component tree to find an InterfaceSpecification by UUID.
 */
function findInterfaceByUuid(root: ComponentNode, uuid: string): ComponentNode["interfaces"][number] | null {
  for (const iface of root.interfaces ?? []) {
    if (iface.uuid === uuid) return iface
  }
  for (const sub of root.subComponents) {
    const found = findInterfaceByUuid(sub, uuid)
    if (found) return found
  }
  return null
}

/**
 * Returns true if the function already exists on the parent interface referenced by
 * `iface.parentInterfaceUuid`. Used to allow referencing inherited functions in
 * sequence diagram messages without trying to add them to the (locked) child interface.
 */
function functionExistsOnParentInterface(
  root: ComponentNode,
  iface: ComponentNode["interfaces"][number],
  functionId: string,
  newParams: Parameter[],
): boolean {
  if (!iface.parentInterfaceUuid) return false
  const parentIface = findInterfaceByUuid(root, iface.parentInterfaceUuid)
  if (!parentIface) return false
  return parentIface.functions.some(
    (f) => f.id === functionId && paramsMatch(f.parameters, newParams),
  )
}

const INTERFACE_TYPE_OWNER: Record<string, "sender" | "receiver"> = {
  kafka: "sender",
  rest: "receiver",
  graphql: "receiver",
  other: "receiver",
}

/**
 * Apply a function to a component identified by UUID, updating it in the full tree.
 * Used for external (path-based) participants where the component is not in the local
 * working-components list.
 */
function applyFunctionToComponentByUuid(
  root: ComponentNode,
  uuid: string,
  interfaceId: string,
  functionId: string,
  rawParams: string,
): ComponentNode {
  return upsertNodeInTree(root, uuid, (node) => {
    const comp = node as ComponentNode
    const interfaces = comp.interfaces ? [...comp.interfaces] : []
    let ifaceIdx = interfaces.findIndex((i) => i.id === interfaceId)
    if (ifaceIdx === -1) {
      interfaces.push({ uuid: crypto.randomUUID(), id: interfaceId, name: interfaceId, type: "rest", functions: [] })
      ifaceIdx = interfaces.length - 1
    }
    const iface = { ...interfaces[ifaceIdx], functions: [...interfaces[ifaceIdx].functions] }
    const newParams = parseParameters(rawParams)
    const exactMatch = iface.functions.findIndex((f) => f.id === functionId && paramsMatch(f.parameters, newParams))
    if (exactMatch === -1) {
      if (iface.parentInterfaceUuid) {
        if (functionExistsOnParentInterface(root, iface, functionId, newParams)) {
          return comp  // function is defined on the parent — treat as found, no-op
        }
        throw new Error(
          `Cannot add function "${functionId}" to interface "${interfaceId}": ` +
          `this interface inherits from a parent and its functions are locked.`,
        )
      }
      const sameIdSameCount = iface.functions.find((f) => f.id === functionId && f.parameters.length === newParams.length)
      if (sameIdSameCount) {
        throw new Error(
          `Parameter mismatch for function "${functionId}" in interface "${interfaceId}": ` +
            `existing (${paramsToString(sameIdSameCount.parameters)}) vs new (${paramsToString(newParams)})`,
        )
      }
      iface.functions.push({ uuid: crypto.randomUUID(), id: functionId, parameters: newParams })
    }
    interfaces[ifaceIdx] = iface
    return { ...comp, interfaces }
  })
}

/**
 * For messages where at least one participant is external, determine which participant
 * UUID should own the function (receiver for REST/graphql/other; sender for kafka).
 * Returns undefined when the owner is local (handled by workingComponents).
 */
function resolveExternalOwnerUuid(
  root: ComponentNode,
  fromExtUuid: string | undefined,
  toExtUuid: string | undefined,
  interfaceId: string,
): string | undefined {
  if (toExtUuid !== undefined) {
    const comp = findCompByUuid(root, toExtUuid)
    const iface = comp?.interfaces?.find((i) => i.id === interfaceId)
    if (iface && INTERFACE_TYPE_OWNER[iface.type] === "sender") {
      return fromExtUuid  // sender-owned interface (e.g. kafka); sender must also be external
    }
    return toExtUuid  // receiver owns (REST default)
  }
  // Only sender is external
  if (fromExtUuid !== undefined) {
    const comp = findCompByUuid(root, fromExtUuid)
    const iface = comp?.interfaces?.find((i) => i.id === interfaceId)
    if (iface && INTERFACE_TYPE_OWNER[iface.type] === "sender") {
      return fromExtUuid  // sender-owned and sender is external
    }
    // Receiver is local — falls through to workingComponents
  }
  return undefined
}

function applyMessageToComponents(
  components: ComponentNode[],
  from: string,
  to: string,
  interfaceId: string,
  functionId: string,
  rawParams: string,
  root: ComponentNode,
): ComponentNode[] {
  const result = [...components]
  const receiverIdx = result.findIndex((c) => c.id === to)
  const senderIdx = result.findIndex((c) => c.id === from)

  // Determine which component owns the interface
  const receiverIface = receiverIdx >= 0 ? result[receiverIdx].interfaces?.find((i) => i.id === interfaceId) : undefined
  let ownerIdx = receiverIdx
  if (receiverIface) {
    ownerIdx = INTERFACE_TYPE_OWNER[receiverIface.type] === "sender" ? senderIdx : receiverIdx
  } else {
    const senderIface = senderIdx >= 0 ? result[senderIdx].interfaces?.find((i) => i.id === interfaceId) : undefined
    if (senderIface && INTERFACE_TYPE_OWNER[senderIface.type] === "sender") ownerIdx = senderIdx
  }

  if (ownerIdx < 0) return result

  const targetComp = { ...result[ownerIdx] }
  const interfaces: InterfaceSpecification[] = targetComp.interfaces ? [...targetComp.interfaces] : []

  let ifaceIdx = interfaces.findIndex((i) => i.id === interfaceId)
  if (ifaceIdx === -1) {
    interfaces.push({ uuid: crypto.randomUUID(), id: interfaceId, name: interfaceId, type: "rest", functions: [] })
    ifaceIdx = interfaces.length - 1
  }

  const iface = { ...interfaces[ifaceIdx], functions: [...interfaces[ifaceIdx].functions] }
  const newParams = parseParameters(rawParams)
  const exactMatchIdx = iface.functions.findIndex((f) => f.id === functionId && paramsMatch(f.parameters, newParams))

  if (exactMatchIdx === -1) {
    if (iface.parentInterfaceUuid) {
      if (functionExistsOnParentInterface(root, iface, functionId, newParams)) {
        return result  // function is defined on the parent — treat as found, no-op
      }
      throw new Error(
        `Cannot add function "${functionId}" to interface "${interfaceId}": ` +
        `this interface inherits from a parent and its functions are locked.`,
      )
    }
    const sameIdSameCount = iface.functions.find((f) => f.id === functionId && f.parameters.length === newParams.length)
    if (sameIdSameCount) {
      throw new Error(
        `Parameter mismatch for function "${functionId}" in interface "${interfaceId}": ` +
          `existing (${paramsToString(sameIdSameCount.parameters)}) vs new (${paramsToString(newParams)})`,
      )
    }
    iface.functions.push({ uuid: crypto.randomUUID(), id: functionId, parameters: newParams })
  }

  interfaces[ifaceIdx] = iface
  targetComp.interfaces = interfaces
  result[ownerIdx] = targetComp
  return result
}

// ─── Exported parser functions ────────────────────────────────────────────────

export function analyzeSequenceDiagramChanges(
  content: string,
  rootComponent: ComponentNode,
  diagramUuid: string,
  allSeqDiagrams: Array<{ uuid: string; referencedFunctionUuids: string[] }>,
): FunctionMatch[] {
  if (!content.trim()) return []
  const { cst, lexErrors, parseErrors } = parseSequenceDiagramCst(content)
  if (lexErrors.length || parseErrors.length) return []

  const ast = buildSeqAst(cst)

  const otherRefs = new Set(
    allSeqDiagrams.filter((d) => d.uuid !== diagramUuid).flatMap((d) => d.referencedFunctionUuids),
  )

  const matches: FunctionMatch[] = []
  const seen = new Set<string>()

  for (const stmt of flattenMessages(ast.statements)) {
    if (stmt.content.kind !== "functionRef") continue
    const { interfaceId, functionId, rawParams } = stmt.content
    const key = `${interfaceId}:${functionId}`
    if (seen.has(key)) continue
    seen.add(key)

    const newParams = parseParameters(rawParams)
    const existing = findFunctionInTree(rootComponent, interfaceId, functionId)
    if (!existing || paramsMatch(existing.parameters, newParams)) continue

    const kind = existing.parameters.length === newParams.length ? "incompatible" : "compatible"
    const affectedDiagramUuids = allSeqDiagrams
      .filter((d) => d.uuid !== diagramUuid && d.referencedFunctionUuids.includes(existing.uuid))
      .map((d) => d.uuid)

    if (kind === "incompatible" && !otherRefs.has(existing.uuid)) continue

    matches.push({ kind, interfaceId, functionId, functionUuid: existing.uuid, oldParams: existing.parameters, newParams, affectedDiagramUuids })
  }

  return matches
}

// eslint-disable-next-line complexity
export function parseSequenceDiagram(
  content: string,
  rootComponent: ComponentNode,
  ownerComponentUuid: string,
  diagramUuid: string,
): ComponentNode {
  if (!content.trim()) return rootComponent
  const { cst, lexErrors, parseErrors } = parseSequenceDiagramCst(content)
  if (lexErrors.length || parseErrors.length) {
    const lexMessages = lexErrors.map((e) => {
      const loc = e.line != null ? `Line ${e.line}, Col ${e.column ?? 1}: ` : ""
      return `${loc}${e.message}`
    })
    const parseMessages = parseErrors.map((e) => {
      const line = e.token?.startLine
      const col = e.token?.startColumn
      const loc = line != null ? `Line ${line}, Col ${col ?? 1}: ` : ""
      return `${loc}${e.message}`
    })
    throw new Error([...lexMessages, ...parseMessages].join("\n"))
  }

  const ast = buildSeqAst(cst)

  // Mutable root — may be updated as missing path nodes are auto-created
  let root = rootComponent

  // Maps participantId (alias or path.last) → treeNodeId (path[0] for local)
  const participantToTreeId = new Map<string, string>()
  // Maps participantId → UUID for external (multi-segment path) participants
  const participantExternalUuidMap = new Map<string, string>()
  const externalUuids: string[] = []
  const localActors: ComponentNode["actors"][number][] = []
  const localComponents: ComponentNode[] = []

  for (const decl of ast.declarations) {
    const treeNodeId = decl.path[decl.path.length - 1]
    participantToTreeId.set(decl.id, decl.path[0])

    if (decl.path.length === 1) {
      // Local node
      if (decl.entityType === "actor") {
        localActors.push({ uuid: crypto.randomUUID(), id: treeNodeId, name: decl.alias ?? deriveNameFromId(treeNodeId), type: "actor", description: "" })
      } else {
        localComponents.push({
          uuid: crypto.randomUUID(), id: treeNodeId, name: decl.alias ?? deriveNameFromId(treeNodeId), type: "component",
          description: "", subComponents: [], actors: [], useCaseDiagrams: [], interfaces: [],
        })
      }
    } else {
      // External node: resolve UUID from root tree (try relative to ownerComp first)
      const pathStr = decl.path.join("/")
      let uuid = findNodeByPath(root, pathStr, ownerComponentUuid)
      if (!uuid) {
        const created = autoCreateByPath(root, decl.path, decl.entityType as "actor" | "component", ownerComponentUuid)
        if (!created) throw new Error(`Cannot resolve path: "${pathStr}"`)
        root = created.updatedRoot
        uuid = created.uuid
      }
      // Scope check: verify the owning component is in scope for this diagram
      const owningCompUuid = decl.entityType === "component"
        ? uuid
        : findNodeByPath(root, decl.path.slice(0, -1).join("/"), ownerComponentUuid)
      if (!owningCompUuid || !isInScope(root, ownerComponentUuid, owningCompUuid)) {
        throw new Error(`Reference "${pathStr}" is out of scope for this diagram`)
      }
      if (!externalUuids.includes(uuid)) externalUuids.push(uuid)
      participantExternalUuidMap.set(decl.id, uuid)
    }
  }

  // Handle self-reference (owner component declared as a participant)
  const ownerCompBefore = findCompByUuid(root, ownerComponentUuid)
  const filteredComponents = localComponents.filter((c) => {
    if (ownerCompBefore && c.id === ownerCompBefore.id) {
      // Self-reference: replace with external UUID
      if (!externalUuids.includes(ownerComponentUuid)) externalUuids.push(ownerComponentUuid)
      // Update participantToTreeId to point to ownerComp
      const pid = [...participantToTreeId.entries()].find(([, v]) => v === c.id)?.[0]
      if (pid) participantToTreeId.set(pid, ownerCompBefore.id)
      return false
    }
    return true
  })

  // Upsert local participants into owner component
  let updatedRoot = upsertNodeInTree(root, ownerComponentUuid, (node) => {
    const comp = node as ComponentNode
    return {
      ...comp,
      actors: mergeLists(comp.actors ?? [], localActors),
      subComponents: mergeLists(comp.subComponents, filteredComponents),
    }
  })

  // Resolve referencedNodeIds from updated tree
  const updatedOwnerComp = findCompByUuid(updatedRoot, ownerComponentUuid)
  const referencedNodeIds = [...externalUuids]

  if (updatedOwnerComp) {
    for (const treeNodeId of new Set(participantToTreeId.values())) {
      const actor = updatedOwnerComp.actors?.find((a) => a.id === treeNodeId)
      if (actor) { if (!referencedNodeIds.includes(actor.uuid)) referencedNodeIds.push(actor.uuid); continue }
      const comp = updatedOwnerComp.subComponents?.find((c) => c.id === treeNodeId)
      if (comp && !referencedNodeIds.includes(comp.uuid)) referencedNodeIds.push(comp.uuid)
    }
    // Also include owner if self-referenced
    if (externalUuids.includes(ownerComponentUuid) && !referencedNodeIds.includes(ownerComponentUuid)) {
      referencedNodeIds.push(ownerComponentUuid)
    }
  }

  // Apply messages: build a working components list [owner, ...subComponents]
  // keyed by treeNodeId for local participants; external participants are handled via UUID.
  const astMessages = flattenMessages(ast.statements)
  if (astMessages.length > 0 && updatedOwnerComp) {
    let workingComponents: ComponentNode[] = [updatedOwnerComp, ...updatedOwnerComp.subComponents]

    // Collect external-participant function assignments to apply after local writeback.
    // They must run after to avoid being overwritten by the workingComponents writeback.
    const pendingExternalFunctions: Array<{ ownerUuid: string; interfaceId: string; functionId: string; rawParams: string }> = []

    for (const msg of astMessages) {
      if (msg.content.kind !== "functionRef") continue
      const { interfaceId, functionId, rawParams } = msg.content
      const fromExtUuid = participantExternalUuidMap.get(msg.from)
      const toExtUuid = participantExternalUuidMap.get(msg.to)

      if (fromExtUuid !== undefined || toExtUuid !== undefined) {
        // At least one participant is external — defer to post-writeback processing
        const ownerUuid = resolveExternalOwnerUuid(updatedRoot, fromExtUuid, toExtUuid, interfaceId)
        if (ownerUuid) {
          pendingExternalFunctions.push({ ownerUuid, interfaceId, functionId, rawParams })
        } else {
          // Owner is local (e.g. kafka sender is local while receiver is external)
          const fromTreeId = participantToTreeId.get(msg.from) ?? msg.from
          const toTreeId = participantToTreeId.get(msg.to) ?? msg.to
          workingComponents = applyMessageToComponents(
            workingComponents, fromTreeId, toTreeId, interfaceId, functionId, rawParams, updatedRoot,
          )
        }
      } else {
        // Both participants are local
        const fromTreeId = participantToTreeId.get(msg.from) ?? msg.from
        const toTreeId = participantToTreeId.get(msg.to) ?? msg.to
        workingComponents = applyMessageToComponents(
          workingComponents, fromTreeId, toTreeId, interfaceId, functionId, rawParams, updatedRoot,
        )
      }
    }

    // Write back local component changes
    const [updatedOwner, ...updatedSubComponents] = workingComponents
    updatedRoot = upsertNodeInTree(updatedRoot, ownerComponentUuid, () => ({
      ...updatedOwner,
      subComponents: updatedSubComponents,
    }))

    // Apply external participant function assignments after writeback
    for (const { ownerUuid, interfaceId, functionId, rawParams } of pendingExternalFunctions) {
      updatedRoot = applyFunctionToComponentByUuid(updatedRoot, ownerUuid, interfaceId, functionId, rawParams)
    }
  }

  // Track referencedFunctionUuids
  const referencedFunctionUuids: string[] = []
  for (const msg of astMessages) {
    if (msg.content.kind !== "functionRef") continue
    const fnUuid = findFunctionUuidInTree(updatedRoot, msg.content.interfaceId, msg.content.functionId)
    if (fnUuid && !referencedFunctionUuids.includes(fnUuid)) referencedFunctionUuids.push(fnUuid)
  }

  // Add referenced use case and sequence diagram UUIDs to referencedNodeIds
  if (updatedOwnerComp) {
    for (const msg of astMessages) {
      if (msg.content.kind === "useCaseRef") {
        const ucUuid = resolveUseCaseByPath(msg.content.path, updatedRoot, updatedOwnerComp, ownerComponentUuid)
        if (ucUuid && !referencedNodeIds.includes(ucUuid)) referencedNodeIds.push(ucUuid)
      } else if (msg.content.kind === "seqDiagramRef") {
        const seqUuid = resolveSeqDiagramByPath(msg.content.path, updatedRoot, updatedOwnerComp, ownerComponentUuid)
        if (seqUuid && !referencedNodeIds.includes(seqUuid)) referencedNodeIds.push(seqUuid)
      }
    }
  }

  // Update diagram node
  updatedRoot = upsertNodeInTree(updatedRoot, diagramUuid, (node) => ({
    ...node,
    referencedNodeIds,
    referencedFunctionUuids,
  }))

  return updatedRoot
}
