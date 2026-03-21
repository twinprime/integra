import type { ComponentNode } from '../store/types'
import { findOwnerActorOrComponentUuidById } from './diagramResolvers'
import { findNodeByPath } from './nodeUtils'

export function resolveDeclarationUuid(
    path: string[],
    ownerComp: ComponentNode | null,
    root: ComponentNode
): string | undefined {
    if (path.length === 1) {
        return ownerComp ? findOwnerActorOrComponentUuidById(ownerComp, path[0]) : undefined
    }
    return findNodeByPath(root, path.join('/')) ?? undefined
}
