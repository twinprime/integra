import type { ComponentNode, SequenceDiagramNode } from '../store/types'
import { applyIdRenameInComponent } from '../nodes/componentNode'
import { findCompByUuid } from '../nodes/componentTraversal'

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Replace every whole-word occurrence of oldId with newId in a diagram spec string. */
export const updateContentRefs = (content: string, oldId: string, newId: string): string =>
    content.replace(new RegExp(`\\b${escapeRegex(oldId)}\\b`, 'g'), newId)

/**
 * Replace oldId as a path segment inside markdown link hrefs.
 * Only modifies links that look like internal node paths (no protocol, anchor, or leading slash).
 */
export const updateDescriptionRefs = (description: string, oldId: string, newId: string): string =>
    description.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (match, text: string, href: string) => {
        if (href.includes('://') || href.startsWith('#') || href.startsWith('/')) return match
        const updatedHref = href
            .split('/')
            .map((seg) => (seg === oldId ? newId : seg))
            .join('/')
        return `[${text}](${updatedHref})`
    })

export type ScopedRenameContext = {
    rootBefore: ComponentNode
    rootAfterTargetId: ComponentNode
    targetUuid: string
    oldId: string
    newId: string
}

const findNodeInComponent = (comp: ComponentNode, nodeId: string): { uuid: string } | null => {
    for (const actor of comp.actors) {
        if (actor.id === nodeId) return actor
    }
    for (const child of comp.subComponents) {
        if (child.id === nodeId) return child
    }
    for (const diagram of comp.useCaseDiagrams) {
        if (diagram.id === nodeId) return diagram
        for (const useCase of diagram.useCases) {
            if (useCase.id === nodeId) return useCase
            for (const sequenceDiagram of useCase.sequenceDiagrams) {
                if (sequenceDiagram.id === nodeId) return sequenceDiagram
            }
        }
    }
    return null
}

const isUseCaseDiagramDescendant = (comp: ComponentNode, targetUuid: string): boolean =>
    comp.useCaseDiagrams.some((diagram) =>
        diagram.useCases.some(
            (useCase) =>
                useCase.uuid === targetUuid ||
                useCase.sequenceDiagrams.some(
                    (sequenceDiagram) => sequenceDiagram.uuid === targetUuid
                )
        )
    )

const findNearestComponentAncestor = (
    root: ComponentNode,
    targetUuid: string
): ComponentNode | null => {
    const search = (comp: ComponentNode): ComponentNode | null => {
        if (comp.actors.some((actor) => actor.uuid === targetUuid)) return comp
        if (comp.subComponents.some((child) => child.uuid === targetUuid)) return comp
        if (comp.useCaseDiagrams.some((diagram) => diagram.uuid === targetUuid)) return comp
        if (isUseCaseDiagramDescendant(comp, targetUuid)) return comp

        for (const child of comp.subComponents) {
            const found = search(child)
            if (found) return found
        }
        return null
    }

    if (root.uuid === targetUuid) return root
    return search(root)
}

const renameTargetIdOnlyInSeqDiag = (
    sd: SequenceDiagramNode,
    targetUuid: string,
    newId: string
): SequenceDiagramNode => ({
    ...sd,
    id: sd.uuid === targetUuid ? newId : sd.id,
})

const renameTargetIdOnlyInComponent = (
    comp: ComponentNode,
    targetUuid: string,
    newId: string
): ComponentNode => ({
    ...comp,
    id: comp.uuid === targetUuid ? newId : comp.id,
    subComponents: comp.subComponents.map((child) =>
        renameTargetIdOnlyInComponent(child, targetUuid, newId)
    ),
    actors: comp.actors.map((actor) => ({
        ...actor,
        id: actor.uuid === targetUuid ? newId : actor.id,
    })),
    useCaseDiagrams: comp.useCaseDiagrams.map((ucd) => ({
        ...ucd,
        id: ucd.uuid === targetUuid ? newId : ucd.id,
        useCases: ucd.useCases.map((useCase) => ({
            ...useCase,
            id: useCase.uuid === targetUuid ? newId : useCase.id,
            sequenceDiagrams: useCase.sequenceDiagrams.map((sd) =>
                renameTargetIdOnlyInSeqDiag(sd, targetUuid, newId)
            ),
        })),
    })),
    interfaces: comp.interfaces.map((iface) => ({
        ...iface,
        id: iface.uuid === targetUuid ? newId : iface.id,
        functions: iface.functions.map((fn) => ({
            ...fn,
            id: fn.uuid === targetUuid ? newId : fn.id,
        })),
    })),
})

const buildScopedRenameContext = (
    root: ComponentNode,
    targetUuid: string,
    oldId: string,
    newId: string
): ScopedRenameContext => ({
    rootBefore: root,
    rootAfterTargetId: renameTargetIdOnlyInComponent(root, targetUuid, newId),
    targetUuid,
    oldId,
    newId,
})

const isInternalHref = (href: string): boolean =>
    !href.includes('://') && !href.startsWith('#') && !href.startsWith('/')

const resolveComponentPathFrom = (
    start: ComponentNode,
    segments: string[]
): ComponentNode | null => {
    let current: ComponentNode | null = start
    for (const segment of segments) {
        current = current.subComponents.find((child) => child.id === segment) ?? null
        if (!current) return null
    }
    return current
}

export const resolveScopedComponentPath = (
    root: ComponentNode,
    ownerComponentUuid: string,
    segments: string[]
): ComponentNode | null => {
    if (segments.length === 0) return findCompByUuid(root, ownerComponentUuid)

    const ownerComponent = findCompByUuid(root, ownerComponentUuid)
    if (!ownerComponent) return null

    if (segments[0] === root.id) {
        if (segments.length === 1) return root
        return resolveComponentPathFrom(root, segments.slice(1))
    }

    return (
        resolveComponentPathFrom(ownerComponent, segments) ??
        resolveComponentPathFrom(root, segments)
    )
}

export const replaceSegmentAt = (segments: string[], index: number, value: string): string[] =>
    segments.map((segment, currentIndex) => (currentIndex === index ? value : segment))

export const renameResolvedPathSegments = (
    segments: string[],
    context: ScopedRenameContext,
    resolveInRoot: (root: ComponentNode, candidateSegments: string[]) => string | null | undefined
): string[] => {
    if (!segments.some((segment) => segment === context.oldId)) return segments
    if (resolveInRoot(context.rootBefore, segments) !== context.targetUuid) return segments

    const matchingCandidates = segments
        .map((segment, index) =>
            segment === context.oldId ? replaceSegmentAt(segments, index, context.newId) : null
        )
        .filter((candidate): candidate is string[] => candidate !== null)
        .filter(
            (candidate) =>
                resolveInRoot(context.rootAfterTargetId, candidate) === context.targetUuid
        )

    return matchingCandidates.length === 1 ? matchingCandidates[0] : segments
}

export const updateDescriptionRefsInContext = (
    description: string,
    contextComponentUuid: string,
    context: ScopedRenameContext
): string =>
    description.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (match, text: string, href: string) => {
        if (!isInternalHref(href)) return match

        const segments = href.split('/')
        const updatedSegments = renameResolvedPathSegments(
            segments,
            context,
            (root, candidateSegments) =>
                resolveDescriptionHref(root, candidateSegments, contextComponentUuid)
        )

        if (updatedSegments === segments) return match
        return `[${text}](${updatedSegments.join('/')})`
    })

const resolveDescriptionHref = (
    root: ComponentNode,
    segments: string[],
    contextComponentUuid: string
): string | null => {
    const ownerComponent = findCompByUuid(root, contextComponentUuid)
    if (!ownerComponent) return null

    if (segments.length === 1) {
        return findNodeInComponent(ownerComponent, segments[0])?.uuid ?? null
    }

    const terminalId = segments[segments.length - 1]
    const targetComponent = resolveScopedComponentPath(
        root,
        contextComponentUuid,
        segments.slice(0, -1)
    )
    if (!targetComponent) return null
    return findNodeInComponent(targetComponent, terminalId)?.uuid ?? null
}

export const renamePathSegments = (path: string[], oldId: string, newId: string): string[] =>
    path.map((segment) => (segment === oldId ? newId : segment))

/**
 * Perform a full deep rename across the entire component tree.
 * Delegates to applyIdRenameInComponent which owns all component-tree traversal.
 */
export const applyIdRename = (
    root: ComponentNode,
    targetUuid: string,
    oldId: string,
    newId: string
): ComponentNode => {
    const targetOwner = findNearestComponentAncestor(root, targetUuid)
    const renameContext = buildScopedRenameContext(root, targetUuid, oldId, newId)

    return applyIdRenameInComponent(
        root,
        targetUuid,
        oldId,
        newId,
        renameContext,
        targetOwner?.uuid ?? root.uuid
    )
}
