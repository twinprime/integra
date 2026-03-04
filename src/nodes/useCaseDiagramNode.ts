import type {
  UseCaseDiagramNode,
  UseCaseNode,
  DiagramNode,
  Node,
} from "../store/types"
import { applyIdRenameInUseCase, findParentInUseCase } from "./useCaseNode"
import { updateDescriptionRefs, updateContentRefs } from "../utils/renameNodeId"

export type DiagramRef = { diagram: DiagramNode; ownerComponentUuid: string }

export const getUcDiagChildren = (ucd: UseCaseDiagramNode): UseCaseNode[] =>
  ucd.useCases

export const deleteFromUcDiag = (
  ucd: UseCaseDiagramNode,
  uuid: string,
): UseCaseDiagramNode => ({
  ...ucd,
  useCases: ucd.useCases.filter((uc) => uc.uuid !== uuid),
})

export const upsertInUcDiag = (
  ucd: UseCaseDiagramNode,
  uuid: string,
  updater: (node: Node) => Node,
): UseCaseDiagramNode => ({
  ...ucd,
  useCases: ucd.useCases.map((uc) =>
    uc.uuid === uuid ? (updater(uc) as UseCaseNode) : uc,
  ),
})

export const collectDiagramsFromUcDiag = (
  ucd: UseCaseDiagramNode,
  ownerComponentUuid: string,
): DiagramRef[] => {
  const refs: DiagramRef[] = [{ diagram: ucd, ownerComponentUuid }]
  for (const uc of ucd.useCases)
    for (const sd of uc.sequenceDiagrams)
      refs.push({ diagram: sd, ownerComponentUuid })
  return refs
}

export const applyIdRenameInUcDiag = (
  ucd: UseCaseDiagramNode,
  targetUuid: string,
  oldId: string,
  newId: string,
): UseCaseDiagramNode => ({
  ...ucd,
  id: ucd.uuid === targetUuid ? newId : ucd.id,
  description: ucd.description
    ? updateDescriptionRefs(ucd.description, oldId, newId)
    : ucd.description,
  content: updateContentRefs(ucd.content, oldId, newId),
  useCases: ucd.useCases.map((uc) => applyIdRenameInUseCase(uc, targetUuid, oldId, newId)),
})

export const getSiblingIdsInUcDiag = (
  ucd: UseCaseDiagramNode,
  uuid: string,
): string[] | null => {
  if (!ucd.useCases.some((uc) => uc.uuid === uuid)) return null
  return ucd.useCases.filter((uc) => uc.uuid !== uuid).map((uc) => uc.id)
}

export const getChildById = (ucd: UseCaseDiagramNode, id: string): UseCaseNode | null =>
  ucd.useCases.find((uc) => uc.id === id) ?? null

export const findParentInUcDiag = (diagram: UseCaseDiagramNode, targetUuid: string): Node | null => {
  for (const useCase of diagram.useCases) {
    if (useCase.uuid === targetUuid) return diagram
    const found = findParentInUseCase(useCase, targetUuid)
    if (found) return found
  }
  return null
}
