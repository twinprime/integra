import type { UseCaseDiagramNode, UseCaseNode, DiagramNode, Node } from '../store/types'
import { applyIdRenameInUseCase, deleteFromUseCase, findParentInUseCase } from './useCaseNode'
import {
    type ScopedRenameContext,
    updateDescriptionRefs,
    updateDescriptionRefsInContext,
    updateUseCaseDiagramRefsInContext,
} from '../utils/renameNodeId'
import { renameInUcdSpec } from '../utils/renameNodeId'
import type { NodeHandler } from './nodeHandler'

export type DiagramRef = { diagram: DiagramNode; ownerComponentUuid: string }

export const getUcDiagChildren = (ucd: UseCaseDiagramNode): ReadonlyArray<UseCaseNode> =>
    ucd.useCases

export const deleteFromUcDiag = (ucd: UseCaseDiagramNode, uuid: string): UseCaseDiagramNode => ({
    ...ucd,
    useCases: ucd.useCases
        .filter((uc) => uc.uuid !== uuid)
        .map((uc) => deleteFromUseCase(uc, uuid)),
})

export const upsertInUcDiag = (
    ucd: UseCaseDiagramNode,
    uuid: string,
    updater: (node: Node) => Node
): UseCaseDiagramNode => ({
    ...ucd,
    useCases: ucd.useCases.map((uc) => (uc.uuid === uuid ? (updater(uc) as UseCaseNode) : uc)),
})

export const collectDiagramsFromUcDiag = (
    ucd: UseCaseDiagramNode,
    ownerComponentUuid: string
): DiagramRef[] => {
    const refs: DiagramRef[] = [{ diagram: ucd, ownerComponentUuid }]
    for (const uc of ucd.useCases)
        for (const sd of uc.sequenceDiagrams) refs.push({ diagram: sd, ownerComponentUuid })
    return refs
}

export const applyIdRenameInUcDiag = (
    ucd: UseCaseDiagramNode,
    targetUuid: string,
    oldId: string,
    newId: string,
    renameContext?: ScopedRenameContext
): UseCaseDiagramNode => ({
    ...ucd,
    id: ucd.uuid === targetUuid ? newId : ucd.id,
    description: ucd.description
        ? renameContext
            ? updateDescriptionRefsInContext(ucd.description, ucd.ownerComponentUuid, renameContext)
            : updateDescriptionRefs(ucd.description, oldId, newId)
        : ucd.description,
    content: renameContext
        ? updateUseCaseDiagramRefsInContext(ucd.content, ucd.ownerComponentUuid, renameContext)
        : renameInUcdSpec(ucd.content, oldId, newId),
    useCases: ucd.useCases.map((uc) =>
        applyIdRenameInUseCase(uc, targetUuid, oldId, newId, renameContext, ucd.ownerComponentUuid)
    ),
})

export const getSiblingIdsInUcDiag = (ucd: UseCaseDiagramNode, uuid: string): string[] | null => {
    if (!ucd.useCases.some((uc) => uc.uuid === uuid)) return null
    return ucd.useCases.filter((uc) => uc.uuid !== uuid).map((uc) => uc.id)
}

export const getChildById = (ucd: UseCaseDiagramNode, id: string): UseCaseNode | null =>
    ucd.useCases.find((uc) => uc.id === id) ?? null

export const findParentInUcDiag = (
    diagram: UseCaseDiagramNode,
    targetUuid: string
): Node | null => {
    for (const useCase of diagram.useCases) {
        if (useCase.uuid === targetUuid) return diagram
        const found = findParentInUseCase(useCase, targetUuid)
        if (found) return found
    }
    return null
}

export const ucDiagHandler: NodeHandler = {
    canDelete: true,
    getChildren: (node) => getUcDiagChildren(node as UseCaseDiagramNode),
    deleteChild: (node, uuid) => deleteFromUcDiag(node as UseCaseDiagramNode, uuid),
    upsertChild: (node, _uuid, updater) => {
        const ucd = node as UseCaseDiagramNode
        return { ...ucd, useCases: ucd.useCases.map((uc) => updater(uc) as UseCaseNode) }
    },
    getChildById: (node, id) => getChildById(node as UseCaseDiagramNode, id),
    addToComponent: (comp, node) => ({
        ...comp,
        useCaseDiagrams: [
            ...comp.useCaseDiagrams,
            { ...(node as UseCaseDiagramNode), ownerComponentUuid: comp.uuid, useCases: [] },
        ],
    }),
    addChild: (node, child) => {
        const ucd = node as UseCaseDiagramNode
        if (child.type !== 'use-case') return ucd
        const uc = child
        return { ...ucd, useCases: [...ucd.useCases, { ...uc, sequenceDiagrams: [] }] }
    },
}
