import { useEffect, useMemo, useRef, useState } from 'react'
import { useSystemStore } from '../store/useSystemStore'
import { getNodeIdPath, findNodeByIdPath } from '../nodes/nodeTree'
import type { ComponentNode } from '../store/types'

/**
 * Syncs selectedNodeId with the URL pathname using the browser History API.
 *
 * - Resolves the entity path present in the URL at mount time and pre-selects
 *   the matching node once the root is available.
 * - Pushes a new history entry when selectedNodeId changes so the browser's
 *   native back/forward navigate between entity selections.
 * - On popstate, re-parses the URL and selects the entity (or reports
 *   a not-found path when the entity cannot be resolved).
 *
 * @param root - The root component node (null while loading).
 * @param routePrefix - URL prefix for this page, e.g. "/models/my-system" or "/file".
 * @returns notFoundPath - The unresolved path string, or null when not in an error state.
 */
export function useEntityNavigation(
    root: ComponentNode | null,
    routePrefix: string
): { notFoundPath: string | null } {
    const selectedNodeId = useSystemStore((s) => s.selectedNodeId)
    const selectNode = useSystemStore((s) => s.selectNode)

    // Captured once on mount via lazy useState — entity path segments from the initial URL.
    // useState's lazy initializer guarantees a single execution, giving us a stable reference.
    const [initialSegments] = useState(() =>
        window.location.pathname
            .replace(new RegExp(`^${routePrefix}/?`), '')
            .split('/')
            .filter(Boolean)
    )

    // Tracks a "not found" path from browser back/forward navigation.
    // Only updated inside event callbacks so setState is never called synchronously
    // inside an effect body.
    const [popstateNotFoundPath, setPopstateNotFoundPath] = useState<string | null>(null)

    const initializedRef = useRef(false)

    // Resolve the initial entity path once root becomes available.
    // Only calls selectNode (Zustand action — not React setState).
    useEffect(() => {
        if (!root || initializedRef.current) return
        initializedRef.current = true
        if (initialSegments.length === 0) return
        const node = findNodeByIdPath(root, initialSegments)
        if (node) selectNode(node.uuid)
        // "not found" case surfaces via initialNotFoundPath derived during render
    }, [root, initialSegments, selectNode])

    // Push a history entry whenever the selected entity changes.
    useEffect(() => {
        if (!root) return
        const path = selectedNodeId !== null ? getNodeIdPath(root, selectedNodeId) : []
        if (path === null) return
        const newUrl = path.length > 0 ? `${routePrefix}/${path.join('/')}` : routePrefix
        if (newUrl === window.location.pathname) return
        history.pushState(null, '', newUrl)
    }, [selectedNodeId, root, routePrefix])

    // Handle browser back/forward.
    useEffect(() => {
        const onPopState = () => {
            if (!root) return
            const segments = window.location.pathname
                .replace(new RegExp(`^${routePrefix}/?`), '')
                .split('/')
                .filter(Boolean)

            if (segments.length === 0) {
                selectNode(null)
                setPopstateNotFoundPath(null)
                return
            }

            const node = findNodeByIdPath(root, segments)
            if (node) {
                selectNode(node.uuid)
                setPopstateNotFoundPath(null)
            } else {
                selectNode(null)
                setPopstateNotFoundPath(segments.join('/'))
            }
        }

        window.addEventListener('popstate', onPopState)
        return () => window.removeEventListener('popstate', onPopState)
    }, [root, routePrefix, selectNode])

    // Show "not found" for the initial URL segments when root loads but no
    // matching entity exists and nothing has been explicitly selected yet.
    const initialNotFoundPath = useMemo(() => {
        if (!root || initialSegments.length === 0) return null
        const node = findNodeByIdPath(root, initialSegments)
        return node ? null : initialSegments.join('/')
    }, [root, initialSegments])

    // Suppress any not-found message once the user selects a node.
    const notFoundPath =
        selectedNodeId !== null ? null : (popstateNotFoundPath ?? initialNotFoundPath)

    return { notFoundPath }
}
