import type { ComponentNode, InterfaceFunction, SequenceDiagramNode } from "./types"
import { parseUseCaseDiagram } from "../parser/useCaseDiagram/systemUpdater"
import { parseSequenceDiagram } from "../parser/sequenceDiagram/systemUpdater"
import { collectAllDiagrams, upsertNodeInTree, findNode } from "../nodes/nodeTree"
import { removeFunctionsFromInterfaces } from "../nodes/componentNode"

export type ReparseResult = { rootComponent?: ComponentNode; parseError?: string | null }

export function rebuildSystemDiagrams(system: ComponentNode): ComponentNode {
  let updatedSystem = system
  const allDiagrams = collectAllDiagrams(updatedSystem)

  allDiagrams.forEach(({ diagram, ownerComponentUuid }) => {
    if (!diagram.ownerComponentUuid) {
      updatedSystem = upsertNodeInTree(updatedSystem, diagram.uuid, (node) => ({
        ...node,
        ownerComponentUuid,
      }))
    }
  })

  // Initialize derived fields on every diagram so they are never undefined,
  // even if the subsequent parse step throws or is skipped.
  allDiagrams.forEach(({ diagram }) => {
    const defaults: Record<string, unknown> = { referencedNodeIds: [] }
    if (diagram.type === "sequence-diagram") defaults.referencedFunctionUuids = []
    updatedSystem = upsertNodeInTree(updatedSystem, diagram.uuid, (node) => ({
      ...node,
      ...defaults,
    }))
  })

  allDiagrams.forEach(({ diagram, ownerComponentUuid }) => {
    if (!diagram.content) return
    if (diagram.type === "use-case-diagram") {
      try {
        updatedSystem = parseUseCaseDiagram(
          diagram.content,
          updatedSystem,
          ownerComponentUuid,
          diagram.uuid,
        )
      } catch (err) {
        console.error(`Failed to parse use-case diagram ${diagram.uuid}:`, err)
      }
    } else if (diagram.type === "sequence-diagram") {
      try {
        updatedSystem = parseSequenceDiagram(
          diagram.content,
          updatedSystem,
          ownerComponentUuid,
          diagram.uuid,
        )
      } catch (err) {
        console.error(`Failed to parse sequence diagram ${diagram.uuid}:`, err)
      }
    }
  })

  return updatedSystem
}

export function stripExclusiveFunctionContributions(
  system: ComponentNode,
  diagramUuid: string,
): ComponentNode {
  const allDiagrams = collectAllDiagrams(system)

  const otherRefs = new Set<string>()
  for (const { diagram } of allDiagrams) {
    if (diagram.uuid !== diagramUuid && diagram.type === "sequence-diagram") {
      for (const uuid of (diagram as SequenceDiagramNode).referencedFunctionUuids) {
        otherRefs.add(uuid)
      }
    }
  }

  const thisDiagram = allDiagrams.find(({ diagram }) => diagram.uuid === diagramUuid)
  if (!thisDiagram || thisDiagram.diagram.type !== "sequence-diagram") return system

  const toRemove = new Set(
    (thisDiagram.diagram as SequenceDiagramNode).referencedFunctionUuids.filter(
      (uuid) => !otherRefs.has(uuid),
    ),
  )
  return removeFunctionsFromInterfaces(system, toRemove)
}

type FunctionSnapshot = Map<string, InterfaceFunction>

/**
 * Walk the component tree and snapshot every InterfaceFunction, keyed by
 * (compUuid, interfaceId, functionId). Used to restore user-authored attributes
 * (descriptions, and any future fields) that are lost when functions are stripped
 * from the tree and recreated from DSL content during reparse.
 */
function buildFunctionSnapshot(root: ComponentNode): FunctionSnapshot {
  const map: FunctionSnapshot = new Map()
  const walk = (comp: ComponentNode) => {
    for (const iface of comp.interfaces ?? []) {
      for (const fn of iface.functions) {
        map.set(`${comp.uuid}:${iface.id}:${fn.id}`, fn)
      }
    }
    for (const sub of comp.subComponents) walk(sub)
  }
  walk(root)
  return map
}

/**
 * After a reparse that stripped and recreated functions, merge user-authored
 * attributes back from the pre-strip snapshot. Matches by (compUuid, interfaceId, functionId).
 *
 * Merge strategy: `{ ...original, ...reparsed }` — parser-authoritative fields
 * (uuid, id, parameters) from the reparsed object win; every other field (description,
 * and any future attributes) from the original is preserved automatically.
 * Parameters are merged the same way by name: `{ ...origParam, ...reparsedParam }`.
 */
function mergeFunctionAttributes(root: ComponentNode, snapshot: FunctionSnapshot): ComponentNode {
  if (snapshot.size === 0) return root
  const mergeComp = (comp: ComponentNode): ComponentNode => {
    const interfaces = comp.interfaces.map((iface) => ({
      ...iface,
      functions: iface.functions.map((fn): InterfaceFunction => {
        const original = snapshot.get(`${comp.uuid}:${iface.id}:${fn.id}`)
        if (!original) return fn
        return {
          ...original,
          ...fn,
          parameters: fn.parameters.map((p) => {
            const origParam = original.parameters.find((op) => op.name === p.name)
            return origParam ? { ...origParam, ...p } : p
          }),
        }
      }),
    }))
    return { ...comp, interfaces, subComponents: comp.subComponents.map(mergeComp) }
  }
  return mergeComp(root)
}

export function tryReparseContent(
  content: string,
  system: ComponentNode,
  nodeUuid: string,
): ReparseResult {
  const node = findNode([system], nodeUuid)
  if (!node || (node.type !== "use-case-diagram" && node.type !== "sequence-diagram")) {
    return { rootComponent: system }
  }
  if (!node.ownerComponentUuid) return { rootComponent: system }
  try {
    if (node.type === "use-case-diagram") {
      return {
        rootComponent: parseUseCaseDiagram(content, system, node.ownerComponentUuid, nodeUuid),
        parseError: null,
      }
    }
    const snapshot = buildFunctionSnapshot(system)
    const cleanedSystem = stripExclusiveFunctionContributions(system, nodeUuid)
    const reparsedRoot = parseSequenceDiagram(content, cleanedSystem, node.ownerComponentUuid, nodeUuid)
    return {
      rootComponent: mergeFunctionAttributes(reparsedRoot, snapshot),
      parseError: null,
    }
  } catch (err) {
    return { parseError: err instanceof Error ? err.message : String(err) }
  }
}
