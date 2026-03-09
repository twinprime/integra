import type { ComponentNode, ActorNode, UseCaseDiagramNode, InterfaceSpecification } from "../store/types"
import {
  collectDiagramsFromUcDiag,
  type DiagramRef,
} from "./useCaseDiagramNode"
import type { NodeHandler } from "./nodeHandler"
import { getComponentChildren, getChildById } from "./componentTraversal"
import { deleteFromComponent } from "./componentCRUD"

export * from "./componentCRUD"
export * from "./interfaceOps"
export * from "./componentTraversal"

// Type alias re-exported for callers
export type { InterfaceSpecification }

export const collectDiagramsFromComponent = (comp: ComponentNode): DiagramRef[] => {
  const refs: DiagramRef[] = []
  for (const ucd of comp.useCaseDiagrams)
    refs.push(...collectDiagramsFromUcDiag(ucd, comp.uuid))
  for (const sub of comp.subComponents)
    refs.push(...collectDiagramsFromComponent(sub))
  return refs
}

export const componentHandler: NodeHandler = {
  canDelete: true,
  getChildren: (node) => getComponentChildren(node as ComponentNode),
  deleteChild: (node, uuid) => deleteFromComponent(node as ComponentNode, uuid),
  upsertChild: (node, _uuid, updater) => {
    const comp = node as ComponentNode
    return {
      ...comp,
      subComponents: comp.subComponents.map((c) => updater(c) as ComponentNode),
      actors: comp.actors.map((a) => updater(a) as ActorNode),
      useCaseDiagrams: comp.useCaseDiagrams.map((d) => updater(d) as UseCaseDiagramNode),
    }
  },
  getChildById: (node, id) => getChildById(node as ComponentNode, id),
  addToComponent: (comp, node) => ({
    ...comp,
    subComponents: [...comp.subComponents, node as ComponentNode],
  }),
  addChild: (node) => node,
}
