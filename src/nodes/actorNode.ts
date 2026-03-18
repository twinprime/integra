import type { ActorNode } from '../store/types'
import {
    type ScopedRenameContext,
    updateDescriptionRefs,
    updateDescriptionRefsInContext,
    updateContentRefs,
} from '../utils/renameNodeId'

export const applyIdRenameInActor = (
    a: ActorNode,
    targetUuid: string,
    oldId: string,
    newId: string,
    renameContext?: ScopedRenameContext,
    contextComponentUuid?: string
): ActorNode => ({
    ...a,
    id: a.uuid === targetUuid ? newId : a.id,
    description: a.description
        ? renameContext && contextComponentUuid
            ? updateDescriptionRefsInContext(a.description, contextComponentUuid, renameContext)
            : updateDescriptionRefs(a.description, oldId, newId)
        : a.description,
})

// Re-export content/description helpers so callers can import from a single place.
export { updateContentRefs, updateDescriptionRefs }
