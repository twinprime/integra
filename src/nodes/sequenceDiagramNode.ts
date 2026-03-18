import type { SequenceDiagramNode, Parameter } from '../store/types'
import {
    type ScopedRenameContext,
    updateDescriptionRefs,
    updateDescriptionRefsInContext,
    updateSequenceDiagramRefsInContext,
} from '../utils/renameNodeId'
import { renameInSeqSpec } from '../utils/renameNodeId'
import { paramsToString } from '../parser/sequenceDiagram/systemUpdater'

export const applyIdRenameInSeqDiag = (
    sd: SequenceDiagramNode,
    targetUuid: string,
    oldId: string,
    newId: string,
    renameContext?: ScopedRenameContext
): SequenceDiagramNode => ({
    ...sd,
    id: sd.uuid === targetUuid ? newId : sd.id,
    description: sd.description
        ? renameContext
            ? updateDescriptionRefsInContext(sd.description, sd.ownerComponentUuid, renameContext)
            : updateDescriptionRefs(sd.description, oldId, newId)
        : sd.description,
    content: renameContext
        ? updateSequenceDiagramRefsInContext(sd.content, sd.ownerComponentUuid, renameContext)
        : renameInSeqSpec(sd.content, oldId, newId),
})

export const replaceSignatureInContent = (
    content: string,
    interfaceId: string,
    functionId: string,
    newParams: ReadonlyArray<Parameter>
): string => {
    const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(${escape(interfaceId)}:${escape(functionId)}\\()[^)]*\\)`, 'g')
    return content.replace(pattern, `${interfaceId}:${functionId}(${paramsToString(newParams)})`)
}

export { updateDescriptionRefs }
