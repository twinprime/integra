import type { UseCaseNode, SequenceDiagramNode, Node } from "../store/types"
import { applyIdRenameInSeqDiag } from "./sequenceDiagramNode"
import { updateDescriptionRefs } from "../utils/renameNodeId"

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
