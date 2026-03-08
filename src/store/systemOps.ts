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

  allDiagrams.forEach(({ diagram, ownerComponentUuid }) => {
    if (diagram.content) {
      if (diagram.type === "use-case-diagram") {
        updatedSystem = parseUseCaseDiagram(
          diagram.content,
          updatedSystem,
          ownerComponentUuid,
          diagram.uuid,
        )
      } else if (diagram.type === "sequence-diagram") {
        try {
          updatedSystem = parseSequenceDiagram(
            diagram.content,
            updatedSystem,
            ownerComponentUuid,
            diagram.uuid,
          )
        } catch {
          // skip invalid diagrams on load
        }
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

type FunctionDescEntry = { description: string | undefined; params: Map<string, string | undefined> }

/** Walk the component tree and index every function's description by (compUuid, ifaceId, fnId). */
function collectFunctionDescriptions(root: ComponentNode): Map<string, FunctionDescEntry> {
  const map = new Map<string, FunctionDescEntry>()
  const walk = (comp: ComponentNode) => {
    for (const iface of comp.interfaces ?? []) {
      for (const fn of iface.functions) {
        const key = `${comp.uuid}:${iface.id}:${fn.id}`
        const paramMap = new Map<string, string | undefined>()
        for (const p of fn.parameters) {
          if (p.description) paramMap.set(p.name, p.description)
        }
        if (fn.description !== undefined || paramMap.size > 0) {
          map.set(key, { description: fn.description, params: paramMap })
        }
      }
    }
    for (const sub of comp.subComponents) walk(sub)
  }
  walk(root)
  return map
}

/**
 * After a reparse that stripped and recreated functions, restore descriptions
 * that were lost. Matches functions by (compUuid, interfaceId, functionId).
 */
function restoreFunctionDescriptions(
  root: ComponentNode,
  descMap: Map<string, FunctionDescEntry>,
): ComponentNode {
  if (descMap.size === 0) return root
  const restoreComp = (comp: ComponentNode): ComponentNode => {
    const interfaces = comp.interfaces.map((iface) => {
      const functions = iface.functions.map((fn): InterfaceFunction => {
        const key = `${comp.uuid}:${iface.id}:${fn.id}`
        const entry = descMap.get(key)
        if (!entry) return fn
        const description = fn.description ?? entry.description
        const parameters = fn.parameters.map((p) => {
          const paramDesc = p.description ?? entry.params.get(p.name)
          return paramDesc !== undefined ? { ...p, description: paramDesc } : p
        })
        return { ...fn, description, parameters }
      })
      return { ...iface, functions }
    })
    const subComponents = comp.subComponents.map(restoreComp)
    return { ...comp, interfaces, subComponents }
  }
  return restoreComp(root)
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
    // Capture descriptions before stripping so they can be restored after the
    // re-parse recreates stripped functions without description metadata.
    const descMap = collectFunctionDescriptions(system)
    const cleanedSystem = stripExclusiveFunctionContributions(system, nodeUuid)
    const reparsedRoot = parseSequenceDiagram(content, cleanedSystem, node.ownerComponentUuid, nodeUuid)
    return {
      rootComponent: restoreFunctionDescriptions(reparsedRoot, descMap),
      parseError: null,
    }
  } catch (err) {
    return { parseError: err instanceof Error ? err.message : String(err) }
  }
}
