import type { ComponentNode } from '../store/types'
import { findNode, findParentNode } from '../nodes/nodeTree'

export type ComponentVisibilityConfig = {
    rootComponent: ComponentNode
    ownerComponent: ComponentNode
    includeOwner: boolean
}

export function isVisibleComponentUuid(
    config: ComponentVisibilityConfig,
    candidateUuid: string,
    ownerAncestors: Set<string>
): boolean {
    const { rootComponent, ownerComponent, includeOwner } = config
    if (includeOwner && candidateUuid === ownerComponent.uuid) return true

    const parent = findParentNode(rootComponent, candidateUuid)
    if (parent?.type !== 'component') return false
    if (parent.uuid === ownerComponent.uuid) return true
    if (ownerAncestors.has(candidateUuid)) return true
    return ownerAncestors.has(parent.uuid)
}

export function getVisibleRepresentativeUuid(
    config: ComponentVisibilityConfig,
    actualUuid: string,
    ownerAncestors: Set<string>
): string | undefined {
    let currentUuid: string | undefined = actualUuid
    while (currentUuid) {
        const node = findNode([config.rootComponent], currentUuid)
        if (node?.type !== 'component') return undefined
        if (isVisibleComponentUuid(config, currentUuid, ownerAncestors)) return currentUuid

        const parent = findParentNode(config.rootComponent, currentUuid)
        currentUuid = parent?.type === 'component' ? parent.uuid : undefined
    }
    return undefined
}

export function isVisibleActorUuid(
    config: ComponentVisibilityConfig,
    actorUuid: string,
    ownerAncestors: Set<string>
): boolean {
    const parent = findParentNode(config.rootComponent, actorUuid)
    if (parent?.type !== 'component') return false
    return (
        parent.uuid === config.ownerComponent.uuid ||
        ownerAncestors.has(parent.uuid) ||
        isVisibleComponentUuid(config, parent.uuid, ownerAncestors)
    )
}
