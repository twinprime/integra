import type { UseCaseNode, SequenceDiagramNode, Node } from "../store/types"
import { applyIdRenameInSeqDiag } from "./sequenceDiagramNode"
import { updateDescriptionRefs } from "../utils/renameNodeId"
import type { NodeHandler } from "./nodeHandler"

export const getUseCaseChildren = (uc: UseCaseNode): SequenceDiagramNode[] =>
  uc.sequenceDiagrams

export const deleteFromUseCase = (uc: UseCaseNode, uuid: string): UseCaseNode => ({
  ...uc,
  sequenceDiagrams: uc.sequenceDiagrams.filter((sd) => sd.uuid !== uuid),
})

export const upsertInUseCase = (
  uc: UseCaseNode,
  uuid: string,
  updater: (node: Node) => Node,
): UseCaseNode => ({
  ...uc,
  sequenceDiagrams: uc.sequenceDiagrams.map((sd) =>
    sd.uuid === uuid ? (updater(sd) as SequenceDiagramNode) : sd,
  ),
})

export const applyIdRenameInUseCase = (
  uc: UseCaseNode,
  targetUuid: string,
  oldId: string,
  newId: string,
): UseCaseNode => ({
  ...uc,
  id: uc.uuid === targetUuid ? newId : uc.id,
  description: uc.description
    ? updateDescriptionRefs(uc.description, oldId, newId)
    : uc.description,
  sequenceDiagrams: uc.sequenceDiagrams.map((sd) =>
    applyIdRenameInSeqDiag(sd, targetUuid, oldId, newId),
  ),
})

export const getSiblingIdsInUseCase = (
  uc: UseCaseNode,
  uuid: string,
): string[] | null => {
  if (!uc.sequenceDiagrams.some((sd) => sd.uuid === uuid)) return null
  return uc.sequenceDiagrams.filter((sd) => sd.uuid !== uuid).map((sd) => sd.id)
}

export const getChildById = (uc: UseCaseNode, id: string): SequenceDiagramNode | null =>
  uc.sequenceDiagrams.find((sd) => sd.id === id) ?? null

export const findParentInUseCase = (useCase: UseCaseNode, targetUuid: string): Node | null => {
  if (useCase.sequenceDiagrams.some((sd) => sd.uuid === targetUuid)) return useCase
  return null
}

export const useCaseHandler: NodeHandler = {
  getChildren: (node) => getUseCaseChildren(node as UseCaseNode),
  deleteChild: (node, uuid) => deleteFromUseCase(node as UseCaseNode, uuid),
  upsertChild: (node, _uuid, updater) => {
    const uc = node as UseCaseNode
    return { ...uc, sequenceDiagrams: uc.sequenceDiagrams.map((sd) => updater(sd) as SequenceDiagramNode) }
  },
  getChildById: (node, id) => getChildById(node as UseCaseNode, id),
  addToComponent: (comp) => comp,
  addChild: (node, child, ownerCompUuid) => {
    const uc = node as UseCaseNode
    if (child.type !== "sequence-diagram") return uc
    const sd = child as SequenceDiagramNode
    return {
      ...uc,
      sequenceDiagrams: [
        ...uc.sequenceDiagrams,
        { ...sd, ownerComponentUuid: ownerCompUuid, referencedFunctionUuids: [] },
      ],
    }
  },
}
