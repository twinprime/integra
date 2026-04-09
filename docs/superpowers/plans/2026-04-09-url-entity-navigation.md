# URL Entity Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reflect the selected tree entity in the browser URL so users can bookmark and share direct links to any entity, with browser back/forward replacing the in-app nav buttons.

**Architecture:** Pure tree-path utilities are added to `nodeTree.ts`. A `useEntityNavigation` hook syncs `selectedNodeId` ↔ `window.location` via `history.pushState` and `popstate`. A new `FilePage` handles `/file/...` routes for filesystem-loaded models; `ModelPage` is extended for `/models/<id>/...` entity paths. In-app back/forward nav state is removed from the store entirely.

**Tech Stack:** React 19, Zustand, TypeScript, Vitest, `@testing-library/react`

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/nodes/nodeTree.ts` | Modify | Add `getNodeIdPath`, `findNodeByIdPath` |
| `src/nodes/nodeTree.test.ts` | Modify | Tests for the two new tree utilities |
| `src/utils/systemFiles.ts` | Modify | Update `getModelRouteComponentId` regex; add `getModelRouteEntityPath`, `isFileRoute`, `getFileRouteEntityPath` |
| `src/utils/systemFiles.test.ts` | Modify | Tests for the new URL helpers |
| `src/hooks/useEntityNavigation.ts` | Create | `selectedNodeId` ↔ URL sync hook (`pushState` + `popstate`) |
| `src/components/FilePage.tsx` | Create | Page for `/file/...` routes; prompts to load a model when none is present |
| `src/App.tsx` | Modify | Add `/file/...` route dispatching to `FilePage` |
| `src/App.test.tsx` | Modify | Add route test for `/file` |
| `src/components/ModelPage.tsx` | Modify | Mount `useEntityNavigation`; render "Entity not found" panel when path unresolvable |
| `src/store/slices/uiSlice.ts` | Modify | Remove `navBack`, `navForward`, `canNavBack`, `canNavForward`, `goBack`, `goForward` |
| `src/components/tree/TreeToolbar.tsx` | Modify | Redirect to `/file` after `handleLoad`; remove back/forward buttons and `Alt+←`/`Alt+→` shortcuts |
| `src/components/tree/TreeToolbar.test.tsx` | Modify | Remove `goBack`/`goForward`/`canNavBack`/`canNavForward` from mock |

---

## Commit message convention

Every commit must reference the plan filename, e.g.:  
`feat: add getNodeIdPath utility [2026-04-09-url-entity-navigation.md:Task 1]`

---

## Task 1: Tree path utilities in `nodeTree.ts`

**Files:**
- Modify: `src/nodes/nodeTree.ts`
- Modify: `src/nodes/nodeTree.test.ts`

- [ ] **Step 1: Write failing tests**

Add to the bottom of `src/nodes/nodeTree.test.ts`:

```ts
import { getNodeIdPath, findNodeByIdPath } from './nodeTree'
import type { ComponentNode, UseCaseDiagramNode, UseCaseNode, SequenceDiagramNode } from '../store/types'

// ─── Shared fixture ───────────────────────────────────────────────────────────

function makeDeepTree(): ComponentNode {
    const seqDiag: SequenceDiagramNode = {
        uuid: 'sd-uuid', id: 'paymentFlow', name: 'Payment Flow',
        type: 'sequence-diagram', content: '', ownerComponentUuid: 'auth-uuid',
        referencedNodeIds: [], referencedFunctionUuids: [],
    }
    const useCase: UseCaseNode = {
        uuid: 'uc-uuid', id: 'checkout', name: 'Checkout',
        type: 'use-case', sequenceDiagrams: [seqDiag],
    }
    const ucd: UseCaseDiagramNode = {
        uuid: 'ucd-uuid', id: 'loginFlow', name: 'Login Flow',
        type: 'use-case-diagram', content: '', ownerComponentUuid: 'auth-uuid',
        referencedNodeIds: [], useCases: [useCase],
    }
    const authComp: ComponentNode = {
        uuid: 'auth-uuid', id: 'auth', name: 'Auth',
        type: 'component', subComponents: [], actors: [],
        useCaseDiagrams: [ucd], interfaces: [],
    }
    const actorNode = { uuid: 'actor-uuid', id: 'customer', name: 'Customer', type: 'actor' as const }
    return {
        uuid: 'root-uuid', id: 'root', name: 'Root',
        type: 'component', subComponents: [authComp],
        actors: [actorNode], useCaseDiagrams: [], interfaces: [],
    }
}

// ─── getNodeIdPath ────────────────────────────────────────────────────────────

describe('getNodeIdPath', () => {
    it('returns empty array for the root component itself', () => {
        const root = makeDeepTree()
        expect(getNodeIdPath(root, 'root-uuid')).toEqual([])
    })

    it('returns single segment for a direct child component', () => {
        const root = makeDeepTree()
        expect(getNodeIdPath(root, 'auth-uuid')).toEqual(['auth'])
    })

    it('returns single segment for a direct actor child', () => {
        const root = makeDeepTree()
        expect(getNodeIdPath(root, 'actor-uuid')).toEqual(['customer'])
    })

    it('returns two segments for a use-case-diagram', () => {
        const root = makeDeepTree()
        expect(getNodeIdPath(root, 'ucd-uuid')).toEqual(['auth', 'loginFlow'])
    })

    it('returns three segments for a use-case', () => {
        const root = makeDeepTree()
        expect(getNodeIdPath(root, 'uc-uuid')).toEqual(['auth', 'loginFlow', 'checkout'])
    })

    it('returns four segments for a sequence-diagram', () => {
        const root = makeDeepTree()
        expect(getNodeIdPath(root, 'sd-uuid')).toEqual(['auth', 'loginFlow', 'checkout', 'paymentFlow'])
    })

    it('returns null for an unknown uuid', () => {
        const root = makeDeepTree()
        expect(getNodeIdPath(root, 'nonexistent-uuid')).toBeNull()
    })
})

// ─── findNodeByIdPath ─────────────────────────────────────────────────────────

describe('findNodeByIdPath', () => {
    it('returns root for empty segments', () => {
        const root = makeDeepTree()
        expect(findNodeByIdPath(root, [])).toBe(root)
    })

    it('finds a direct child component', () => {
        const root = makeDeepTree()
        expect(findNodeByIdPath(root, ['auth'])?.uuid).toBe('auth-uuid')
    })

    it('finds a direct actor', () => {
        const root = makeDeepTree()
        expect(findNodeByIdPath(root, ['customer'])?.uuid).toBe('actor-uuid')
    })

    it('finds a use-case-diagram', () => {
        const root = makeDeepTree()
        expect(findNodeByIdPath(root, ['auth', 'loginFlow'])?.uuid).toBe('ucd-uuid')
    })

    it('finds a use-case', () => {
        const root = makeDeepTree()
        expect(findNodeByIdPath(root, ['auth', 'loginFlow', 'checkout'])?.uuid).toBe('uc-uuid')
    })

    it('finds a sequence diagram', () => {
        const root = makeDeepTree()
        expect(findNodeByIdPath(root, ['auth', 'loginFlow', 'checkout', 'paymentFlow'])?.uuid).toBe('sd-uuid')
    })

    it('returns null for a nonexistent first segment', () => {
        const root = makeDeepTree()
        expect(findNodeByIdPath(root, ['nonexistent'])).toBeNull()
    })

    it('returns null for a nonexistent deep segment', () => {
        const root = makeDeepTree()
        expect(findNodeByIdPath(root, ['auth', 'nonexistent'])).toBeNull()
    })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npx vitest run src/nodes/nodeTree.test.ts
```

Expected: FAIL — `getNodeIdPath is not exported`, `findNodeByIdPath is not exported`

- [ ] **Step 3: Implement the utilities**

Add to the bottom of `src/nodes/nodeTree.ts` (before the re-export block):

```ts
// ─── URL path utilities ───────────────────────────────────────────────────────

/**
 * Returns the chain of `id` segments from root's first child down to the node
 * with the given UUID. Returns an empty array if the UUID is the root itself.
 * Returns null if the UUID is not found anywhere in the tree.
 */
export function getNodeIdPath(root: ComponentNode, uuid: string): string[] | null {
    if (root.uuid === uuid) return []

    function search(node: Node, path: string[]): string[] | null {
        for (const child of getNodeChildren(node)) {
            const childPath = [...path, child.id]
            if (child.uuid === uuid) return childPath
            const found = search(child, childPath)
            if (found !== null) return found
        }
        return null
    }

    return search(root, [])
}

/**
 * Resolves a chain of `id` segments to a node in the tree.
 * An empty segments array returns the root itself.
 * Returns null if any segment in the chain cannot be found.
 */
export function findNodeByIdPath(root: ComponentNode, segments: string[]): Node | null {
    if (segments.length === 0) return root

    function search(node: Node, remaining: string[]): Node | null {
        const [head, ...tail] = remaining
        for (const child of getNodeChildren(node)) {
            if (child.id === head) {
                if (tail.length === 0) return child
                return search(child, tail)
            }
        }
        return null
    }

    return search(root, segments)
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npx vitest run src/nodes/nodeTree.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/nodes/nodeTree.ts src/nodes/nodeTree.test.ts
git commit -m "feat: add getNodeIdPath and findNodeByIdPath to nodeTree [2026-04-09-url-entity-navigation.md:Task 1]"
```

---

## Task 2: URL helper functions in `systemFiles.ts`

**Files:**
- Modify: `src/utils/systemFiles.ts`
- Modify: `src/utils/systemFiles.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/utils/systemFiles.test.ts` (after existing imports, after existing tests):

```ts
import {
    getModelRouteComponentId,
    getModelRouteEntityPath,
    isFileRoute,
    getFileRouteEntityPath,
} from './systemFiles'

// ─── getModelRouteComponentId (updated regex) ─────────────────────────────────

describe('getModelRouteComponentId', () => {
    afterEach(() => {
        window.history.replaceState({}, '', '/')
    })

    it('returns null for the root path', () => {
        window.history.replaceState({}, '', '/')
        expect(getModelRouteComponentId()).toBeNull()
    })

    it('returns the component id from /models/<id>', () => {
        window.history.replaceState({}, '', '/models/my-system')
        expect(getModelRouteComponentId()).toBe('my-system')
    })

    it('returns the component id from /models/<id>/ (trailing slash)', () => {
        window.history.replaceState({}, '', '/models/my-system/')
        expect(getModelRouteComponentId()).toBe('my-system')
    })

    it('returns the component id from /models/<id>/entity/path', () => {
        window.history.replaceState({}, '', '/models/my-system/auth/login-flow')
        expect(getModelRouteComponentId()).toBe('my-system')
    })
})

// ─── getModelRouteEntityPath ──────────────────────────────────────────────────

describe('getModelRouteEntityPath', () => {
    afterEach(() => {
        window.history.replaceState({}, '', '/')
    })

    it('returns empty array for /models/<id> with no entity', () => {
        window.history.replaceState({}, '', '/models/my-system')
        expect(getModelRouteEntityPath()).toEqual([])
    })

    it('returns single segment for /models/<id>/<seg>', () => {
        window.history.replaceState({}, '', '/models/my-system/auth')
        expect(getModelRouteEntityPath()).toEqual(['auth'])
    })

    it('returns multiple segments for /models/<id>/<seg1>/<seg2>/<seg3>', () => {
        window.history.replaceState({}, '', '/models/my-system/auth/loginFlow/checkout')
        expect(getModelRouteEntityPath()).toEqual(['auth', 'loginFlow', 'checkout'])
    })

    it('returns empty array when not on a models route', () => {
        window.history.replaceState({}, '', '/')
        expect(getModelRouteEntityPath()).toEqual([])
    })
})

// ─── isFileRoute ──────────────────────────────────────────────────────────────

describe('isFileRoute', () => {
    afterEach(() => {
        window.history.replaceState({}, '', '/')
    })

    it('returns true for /file', () => {
        window.history.replaceState({}, '', '/file')
        expect(isFileRoute()).toBe(true)
    })

    it('returns true for /file/', () => {
        window.history.replaceState({}, '', '/file/')
        expect(isFileRoute()).toBe(true)
    })

    it('returns true for /file/auth/login-flow', () => {
        window.history.replaceState({}, '', '/file/auth/login-flow')
        expect(isFileRoute()).toBe(true)
    })

    it('returns false for /', () => {
        window.history.replaceState({}, '', '/')
        expect(isFileRoute()).toBe(false)
    })

    it('returns false for /models/foo', () => {
        window.history.replaceState({}, '', '/models/foo')
        expect(isFileRoute()).toBe(false)
    })
})

// ─── getFileRouteEntityPath ───────────────────────────────────────────────────

describe('getFileRouteEntityPath', () => {
    afterEach(() => {
        window.history.replaceState({}, '', '/')
    })

    it('returns empty array for /file with no entity', () => {
        window.history.replaceState({}, '', '/file')
        expect(getFileRouteEntityPath()).toEqual([])
    })

    it('returns empty array for /file/', () => {
        window.history.replaceState({}, '', '/file/')
        expect(getFileRouteEntityPath()).toEqual([])
    })

    it('returns single segment for /file/auth', () => {
        window.history.replaceState({}, '', '/file/auth')
        expect(getFileRouteEntityPath()).toEqual(['auth'])
    })

    it('returns multiple segments for /file/auth/loginFlow/checkout', () => {
        window.history.replaceState({}, '', '/file/auth/loginFlow/checkout')
        expect(getFileRouteEntityPath()).toEqual(['auth', 'loginFlow', 'checkout'])
    })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npx vitest run src/utils/systemFiles.test.ts
```

Expected: FAIL — `getModelRouteEntityPath is not exported`, `isFileRoute is not exported`, `getFileRouteEntityPath is not exported`; `getModelRouteComponentId` may fail for the entity-path cases.

- [ ] **Step 3: Update `getModelRouteComponentId` regex and add new helpers**

In `src/utils/systemFiles.ts`, in the `// ── URL-based loading ─────────────────────────────────────────────────────────` section, replace the existing `getModelRouteComponentId` function and add the new helpers:

```ts
const MODELS_BASE_PATH = '/models'
const FILE_BASE_PATH = '/file'

/** Returns the component ID from the URL if on a /models/<id>/... route, otherwise null. */
export function getModelRouteComponentId(): string | null {
    const match = window.location.pathname.match(new RegExp(`^${MODELS_BASE_PATH}/([^/]+)(/.*)?$`))
    return match ? match[1] : null
}

/**
 * Returns entity path segments from /models/<id>/<seg1>/<seg2>/...
 * Returns an empty array when on /models/<id> with no entity path.
 */
export function getModelRouteEntityPath(): string[] {
    const match = window.location.pathname.match(
        new RegExp(`^${MODELS_BASE_PATH}/[^/]+/(.+)$`)
    )
    if (!match) return []
    return match[1].split('/').filter(Boolean)
}

/** Returns true when the current pathname is /file or /file/<...>. */
export function isFileRoute(): boolean {
    const p = window.location.pathname
    return p === FILE_BASE_PATH || p.startsWith(FILE_BASE_PATH + '/')
}

/**
 * Returns entity path segments from /file/<seg1>/<seg2>/...
 * Returns an empty array when on /file with no entity path.
 */
export function getFileRouteEntityPath(): string[] {
    const rest = window.location.pathname.slice(FILE_BASE_PATH.length)
    if (!rest || rest === '/') return []
    return rest.replace(/^\//, '').split('/').filter(Boolean)
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npx vitest run src/utils/systemFiles.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/systemFiles.ts src/utils/systemFiles.test.ts
git commit -m "feat: add URL path helpers for /file and /models entity routing [2026-04-09-url-entity-navigation.md:Task 2]"
```

---

## Task 3: `useEntityNavigation` hook

**Files:**
- Create: `src/hooks/useEntityNavigation.ts`

There is no existing hook test file to mirror — write a dedicated test file alongside:
- Create: `src/hooks/useEntityNavigation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/hooks/useEntityNavigation.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useEntityNavigation } from './useEntityNavigation'

// ─── Store mock ───────────────────────────────────────────────────────────────

vi.mock('../store/useSystemStore', () => ({
    useSystemStore: vi.fn(),
}))

import { useSystemStore } from '../store/useSystemStore'
import type { SystemState } from '../store/useSystemStore'
import type { ComponentNode } from '../store/types'

const mockSelectNode = vi.fn()

function makeRoot(): ComponentNode {
    return {
        uuid: 'root-uuid', id: 'root', name: 'Root',
        type: 'component', subComponents: [
            {
                uuid: 'auth-uuid', id: 'auth', name: 'Auth',
                type: 'component', subComponents: [], actors: [],
                useCaseDiagrams: [{
                    uuid: 'ucd-uuid', id: 'loginFlow', name: 'Login Flow',
                    type: 'use-case-diagram', content: '', ownerComponentUuid: 'auth-uuid',
                    referencedNodeIds: [], useCases: [],
                }], interfaces: [],
            },
        ], actors: [], useCaseDiagrams: [], interfaces: [],
    }
}

function setupStore(selectedNodeId: string | null = null, root = makeRoot()) {
    const state = { selectedNodeId, rootComponent: root, selectNode: mockSelectNode }
    vi.mocked(useSystemStore).mockImplementation(
        (selector: (s: SystemState) => unknown) => selector(state as unknown as SystemState)
    )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useEntityNavigation', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        window.history.replaceState({}, '', '/file')
        vi.spyOn(window.history, 'pushState')
    })

    afterEach(() => {
        window.history.replaceState({}, '', '/')
    })

    it('selects the node matching the initial URL entity path on mount', () => {
        window.history.replaceState({}, '', '/file/auth/loginFlow')
        setupStore(null)

        renderHook(() => useEntityNavigation('/file'))

        expect(mockSelectNode).toHaveBeenCalledWith('ucd-uuid')
    })

    it('returns entityNotFound=false when entity path resolves', () => {
        window.history.replaceState({}, '', '/file/auth')
        setupStore(null)

        const { result } = renderHook(() => useEntityNavigation('/file'))

        expect(result.current.entityNotFound).toBe(false)
    })

    it('returns entityNotFound=true when entity path does not resolve', () => {
        window.history.replaceState({}, '', '/file/nonexistent/path')
        setupStore(null)

        const { result } = renderHook(() => useEntityNavigation('/file'))

        expect(result.current.entityNotFound).toBe(true)
        expect(mockSelectNode).not.toHaveBeenCalled()
    })

    it('does not call selectNode when URL has no entity path', () => {
        window.history.replaceState({}, '', '/file')
        setupStore(null)

        renderHook(() => useEntityNavigation('/file'))

        expect(mockSelectNode).not.toHaveBeenCalled()
    })

    it('pushes URL when selectedNodeId changes after mount', () => {
        window.history.replaceState({}, '', '/file')
        setupStore(null)

        const { rerender } = renderHook(() => useEntityNavigation('/file'))

        // Simulate user selecting a node
        setupStore('auth-uuid')
        rerender()

        expect(window.history.pushState).toHaveBeenCalledWith({}, '', '/file/auth')
    })

    it('pushes /file (no segments) when selectedNodeId becomes null after mount', () => {
        window.history.replaceState({}, '', '/file/auth')
        setupStore('auth-uuid')

        const { rerender } = renderHook(() => useEntityNavigation('/file'))

        setupStore(null)
        rerender()

        expect(window.history.pushState).toHaveBeenCalledWith({}, '', '/file')
    })

    it('updates selectedNodeId on popstate event', () => {
        window.history.replaceState({}, '', '/file')
        setupStore(null)

        renderHook(() => useEntityNavigation('/file'))

        // Simulate browser back to /file/auth
        window.history.replaceState({}, '', '/file/auth')
        act(() => {
            window.dispatchEvent(new PopStateEvent('popstate'))
        })

        expect(mockSelectNode).toHaveBeenCalledWith('auth-uuid')
    })

    it('sets entityNotFound=true on popstate to unresolvable path', () => {
        window.history.replaceState({}, '', '/file')
        setupStore(null)

        const { result } = renderHook(() => useEntityNavigation('/file'))

        window.history.replaceState({}, '', '/file/gone/missing')
        act(() => {
            window.dispatchEvent(new PopStateEvent('popstate'))
        })

        expect(result.current.entityNotFound).toBe(true)
    })

    it('clears entityNotFound on popstate to valid path after a not-found state', () => {
        window.history.replaceState({}, '', '/file/nonexistent')
        setupStore(null)

        const { result, rerender } = renderHook(() => useEntityNavigation('/file'))

        // Start with not-found
        expect(result.current.entityNotFound).toBe(true)

        // Navigate to valid path via popstate
        window.history.replaceState({}, '', '/file/auth')
        act(() => {
            window.dispatchEvent(new PopStateEvent('popstate'))
        })

        expect(result.current.entityNotFound).toBe(false)
        expect(mockSelectNode).toHaveBeenCalledWith('auth-uuid')
    })

    it('works with /models/<id> as basePath', () => {
        window.history.replaceState({}, '', '/models/my-system/auth')
        setupStore(null)

        renderHook(() => useEntityNavigation('/models/my-system'))

        expect(mockSelectNode).toHaveBeenCalledWith('auth-uuid')
    })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npx vitest run src/hooks/useEntityNavigation.test.ts
```

Expected: FAIL — `Cannot find module './useEntityNavigation'`

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useEntityNavigation.ts`:

```ts
import { useEffect, useRef, useState } from 'react'
import { useSystemStore } from '../store/useSystemStore'
import { getNodeIdPath, findNodeByIdPath } from '../nodes/nodeTree'

function parseSegments(basePath: string): string[] {
    const rest = window.location.pathname.slice(basePath.length)
    if (!rest || rest === '/') return []
    return rest.replace(/^\//, '').split('/').filter(Boolean)
}

function buildUrl(basePath: string, segments: string[]): string {
    return segments.length > 0 ? `${basePath}/${segments.join('/')}` : basePath
}

/**
 * Syncs the selected entity with the browser URL.
 *
 * - On mount: resolves entity path segments from the current URL and calls
 *   `selectNode` if found; sets `entityNotFound` if not found.
 * - On `selectedNodeId` change (user action): pushes a new browser history
 *   entry via `history.pushState`.
 * - On `popstate` (browser back/forward): re-parses the URL and selects the
 *   resolved node, or sets `entityNotFound` if unresolvable.
 *
 * @param basePath The base path for this route, e.g. '/file' or '/models/my-system'
 */
export function useEntityNavigation(basePath: string): { entityNotFound: boolean } {
    const selectedNodeId = useSystemStore((s) => s.selectedNodeId)
    const rootComponent = useSystemStore((s) => s.rootComponent)
    const selectNode = useSystemStore((s) => s.selectNode)

    const [entityNotFound, setEntityNotFound] = useState(false)

    // Tracks whether the initial mount resolution has run
    const initialized = useRef(false)
    // Tracks the last selectedNodeId we pushed to history (to avoid double-push
    // when popstate triggers selectNode which in turn would fire the push effect)
    const lastPushedId = useRef<string | null>(null)

    // ── Initial mount: resolve entity from URL ────────────────────────────────
    useEffect(() => {
        initialized.current = true
        lastPushedId.current = selectedNodeId

        const segments = parseSegments(basePath)
        if (segments.length === 0) return

        const node = findNodeByIdPath(rootComponent, segments)
        if (node) {
            lastPushedId.current = node.uuid
            selectNode(node.uuid)
            setEntityNotFound(false)
        } else {
            setEntityNotFound(true)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── selectedNodeId changes → pushState ────────────────────────────────────
    useEffect(() => {
        if (!initialized.current) return
        if (selectedNodeId === lastPushedId.current) return

        lastPushedId.current = selectedNodeId

        const path = selectedNodeId ? getNodeIdPath(rootComponent, selectedNodeId) : []
        if (path === null) return // node not in tree — skip

        setEntityNotFound(false)
        history.pushState({}, '', buildUrl(basePath, path))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedNodeId])

    // ── popstate → resolve URL → selectNode ──────────────────────────────────
    useEffect(() => {
        const handlePopState = () => {
            const segments = parseSegments(basePath)
            if (segments.length === 0) {
                lastPushedId.current = null
                selectNode(null)
                setEntityNotFound(false)
                return
            }
            const node = findNodeByIdPath(rootComponent, segments)
            if (node) {
                lastPushedId.current = node.uuid
                selectNode(node.uuid)
                setEntityNotFound(false)
            } else {
                setEntityNotFound(true)
            }
        }

        window.addEventListener('popstate', handlePopState)
        return () => window.removeEventListener('popstate', handlePopState)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rootComponent, selectNode])

    return { entityNotFound }
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npx vitest run src/hooks/useEntityNavigation.test.ts
```

Expected: all PASS

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npx vitest run
```

Expected: no new failures

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useEntityNavigation.ts src/hooks/useEntityNavigation.test.ts
git commit -m "feat: add useEntityNavigation hook for URL ↔ selectedNodeId sync [2026-04-09-url-entity-navigation.md:Task 3]"
```

---

## Task 4: `FilePage` component and `App.tsx` routing

**Files:**
- Create: `src/components/FilePage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write failing test for App routing**

Add to `src/App.test.tsx` (after the existing `afterEach`):

```ts
it('renders FilePage when on the /file route', () => {
    window.history.replaceState({}, '', '/file')

    render(<App />)

    // FilePage renders a MainLayout; the tree panel appears
    // We just verify it doesn't render the user guide or crash
    expect(screen.queryByRole('heading', { name: 'Integra User Guide', level: 1 })).not.toBeInTheDocument()
})
```

Run: `npx vitest run src/App.test.tsx` — Expected: FAIL (no `/file` route exists yet)

- [ ] **Step 2: Create `FilePage.tsx`**

Create `src/components/FilePage.tsx`:

```tsx
import { useEffect } from 'react'
import { MainLayout } from '../layouts/MainLayout'
import { TreeView } from './TreeView'
import { EditorPanel } from './EditorPanel'
import { DiagramPanel } from './DiagramPanel'
import { useSystemStore } from '../store/useSystemStore'
import { loadFromDirectory, getFileRouteEntityPath } from '../utils/systemFiles'
import { useEntityNavigation } from '../hooks/useEntityNavigation'

const INITIAL_ROOT_UUID = 'root-component-uuid'

function EntityNotFoundPanel({ path }: { path: string }) {
    return (
        <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center max-w-md px-6">
                <p className="text-lg font-medium text-red-400">Entity not found</p>
                <p className="text-sm text-gray-500 font-mono break-all">{path}</p>
            </div>
        </div>
    )
}

function NoModelPanel({ onLoad }: { onLoad: () => void }) {
    return (
        <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
                <p className="text-gray-400 text-sm">No model loaded.</p>
                <button
                    onClick={onLoad}
                    className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:bg-gray-800 hover:text-gray-100"
                >
                    Load a model from directory
                </button>
            </div>
        </div>
    )
}

export function FilePage() {
    const rootComponent = useSystemStore((s) => s.rootComponent)
    const setSystem = useSystemStore((s) => s.setSystem)
    const setBrowseLocked = useSystemStore((s) => s.setBrowseLocked)
    const markSaved = useSystemStore((s) => s.markSaved)
    const uiMode = useSystemStore((s) => s.uiMode)

    const hasLoadedModel = rootComponent.uuid !== INITIAL_ROOT_UUID

    const { entityNotFound } = useEntityNavigation('/file')

    const entityPath = getFileRouteEntityPath().join('/')

    const handleLoad = async () => {
        try {
            if (!('showDirectoryPicker' in window)) {
                alert('Loading from a directory requires Chrome or Edge.')
                return
            }
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
            const loaded = await loadFromDirectory(handle)
            setSystem(loaded)
            setBrowseLocked(false)
            const yaml = (await import('js-yaml')).default
            markSaved(yaml.dump(loaded, { indent: 2, noRefs: true, skipInvalid: true }))
        } catch (error) {
            if ((error as DOMException).name !== 'AbortError') {
                alert('Failed to load: ' + (error as Error).message)
            }
        }
    }

    const rightPanel =
        !hasLoadedModel ? (
            <NoModelPanel onLoad={() => void handleLoad()} />
        ) : entityNotFound ? (
            <EntityNotFoundPanel path={entityPath} />
        ) : (
            <EditorPanel />
        )

    return (
        <MainLayout
            leftPanel={<TreeView />}
            rightPanel={rightPanel}
            bottomPanel={<DiagramPanel />}
        />
    )
}
```

- [ ] **Step 3: Update `App.tsx` to dispatch `/file/...` to `FilePage`**

Replace `src/App.tsx` with:

```tsx
import { MainLayout } from './layouts/MainLayout'
import { UserGuidePage } from './components/UserGuidePage'
import { ModelPage } from './components/ModelPage'
import { FilePage } from './components/FilePage'
import { TreeView } from './components/TreeView'
import { EditorPanel } from './components/EditorPanel'
import { DiagramPanel } from './components/DiagramPanel'
import { getModelRouteComponentId, isFileRoute } from './utils/systemFiles'

function App() {
    const view = new URLSearchParams(window.location.search).get('view')

    if (view === 'user-guide') {
        return <UserGuidePage />
    }

    if (getModelRouteComponentId() !== null) {
        return <ModelPage />
    }

    if (isFileRoute()) {
        return <FilePage />
    }

    return (
        <MainLayout
            leftPanel={<TreeView />}
            rightPanel={<EditorPanel />}
            bottomPanel={<DiagramPanel />}
        />
    )
}

export default App
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npx vitest run src/App.test.tsx
```

Expected: all PASS

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: no new failures

- [ ] **Step 6: Fix any lint errors**

```bash
npm run lint:fix
```

- [ ] **Step 7: Commit**

```bash
git add src/components/FilePage.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: add FilePage and /file routing in App [2026-04-09-url-entity-navigation.md:Task 4]"
```

---

## Task 5: Extend `ModelPage` with entity navigation

**Files:**
- Modify: `src/components/ModelPage.tsx`

`ModelPage` already renders the full layout when `loadState.status === 'ready'`. We need to:
1. Mount `useEntityNavigation` in the ready state
2. Show "Entity not found" panel when the URL entity path doesn't resolve

- [ ] **Step 1: Update `ModelPage.tsx`**

Replace the contents of `src/components/ModelPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { MainLayout } from '../layouts/MainLayout'
import { TreeView } from './TreeView'
import { EditorPanel } from './EditorPanel'
import { DiagramPanel } from './DiagramPanel'
import { useSystemStore } from '../store/useSystemStore'
import { loadFromUrl, NotFoundError, getModelRouteComponentId, getModelRouteEntityPath } from '../utils/systemFiles'
import { useEntityNavigation } from '../hooks/useEntityNavigation'

type LoadState =
    | { status: 'loading' }
    | { status: 'not-found'; componentId: string }
    | { status: 'error'; message: string }
    | { status: 'ready' }

function FullScreenMessage({ children }: { children: React.ReactNode }) {
    return (
        <div className="h-screen w-screen bg-gray-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
                {children}
                <a
                    href="/"
                    className="mt-2 rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:bg-gray-800 hover:text-gray-100"
                >
                    Go to app
                </a>
            </div>
        </div>
    )
}

function EntityNotFoundPanel({ path }: { path: string }) {
    return (
        <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center max-w-md px-6">
                <p className="text-lg font-medium text-red-400">Entity not found</p>
                <p className="text-sm text-gray-500 font-mono break-all">{path}</p>
            </div>
        </div>
    )
}

function ReadyModelPage({ componentId }: { componentId: string }) {
    const { entityNotFound } = useEntityNavigation(`/models/${componentId}`)
    const entityPath = getModelRouteEntityPath().join('/')

    const rightPanel = entityNotFound ? (
        <EntityNotFoundPanel path={entityPath} />
    ) : (
        <EditorPanel />
    )

    return (
        <MainLayout
            leftPanel={<TreeView />}
            rightPanel={rightPanel}
            bottomPanel={<DiagramPanel />}
        />
    )
}

export function ModelPage() {
    const componentId = getModelRouteComponentId()
    const setSystem = useSystemStore((s) => s.setSystem)
    const setUiMode = useSystemStore((s) => s.setUiMode)
    const setBrowseLocked = useSystemStore((s) => s.setBrowseLocked)

    const [loadState, setLoadState] = useState<LoadState>(() =>
        componentId ? { status: 'loading' } : { status: 'not-found', componentId: '' }
    )

    useEffect(() => {
        if (!componentId) return
        let cancelled = false
        void loadFromUrl(componentId)
            .then((tree) => {
                if (cancelled) return
                setSystem(tree)
                setUiMode('browse')
                setBrowseLocked(true)
                setLoadState({ status: 'ready' })
            })
            .catch((err: unknown) => {
                if (cancelled) return
                if (err instanceof NotFoundError) {
                    setLoadState({ status: 'not-found', componentId: componentId ?? '' })
                } else {
                    setLoadState({
                        status: 'error',
                        message: err instanceof Error ? err.message : 'Unknown error',
                    })
                }
            })
        return () => {
            cancelled = true
        }
    }, [componentId, setSystem, setUiMode, setBrowseLocked])

    if (loadState.status === 'loading') {
        return (
            <div className="h-screen w-screen bg-gray-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-gray-400">
                    <div className="w-8 h-8 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
                    <p className="text-sm">Loading model…</p>
                </div>
            </div>
        )
    }

    if (loadState.status === 'not-found') {
        return (
            <FullScreenMessage>
                <p className="text-6xl font-bold text-gray-700">404</p>
                <p className="text-lg font-medium text-gray-300">Model not found</p>
                {loadState.componentId && (
                    <p className="text-sm text-gray-500 font-mono">{loadState.componentId}</p>
                )}
            </FullScreenMessage>
        )
    }

    if (loadState.status === 'error') {
        return (
            <FullScreenMessage>
                <p className="text-lg font-medium text-red-400">Failed to load model</p>
                <p className="text-sm text-gray-500 font-mono break-all">{loadState.message}</p>
            </FullScreenMessage>
        )
    }

    return <ReadyModelPage componentId={componentId!} />
}
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: no new failures

- [ ] **Step 3: Fix any lint errors**

```bash
npm run lint:fix
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ModelPage.tsx
git commit -m "feat: mount useEntityNavigation in ModelPage with entity-not-found panel [2026-04-09-url-entity-navigation.md:Task 5]"
```

---

## Task 6: Remove in-app back/forward navigation

Remove `navBack`, `navForward`, `canNavBack`, `canNavForward`, `goBack`, `goForward` from the store, their UI in `TreeToolbar`, and their keyboard shortcuts.

**Files:**
- Modify: `src/store/slices/uiSlice.ts`
- Modify: `src/components/tree/TreeToolbar.tsx`
- Modify: `src/components/tree/TreeToolbar.test.tsx`

- [ ] **Step 1: Update `uiSlice.ts`**

Replace the entire contents of `src/store/slices/uiSlice.ts`:

```ts
import type { StateCreator } from 'zustand'
import type { SystemState } from '../useSystemStore'

export type UiMode = 'browse' | 'edit'

export type UiSlice = {
    uiMode: UiMode
    browseLocked: boolean
    selectedNodeId: string | null
    activeVisualizationViewId: string | null
    showGeneratedClassDiagramInterfaces: boolean
    selectedInterfaceUuid: string | null
    parseError: string | null
    savedSnapshot: string | null
    setUiMode: (mode: UiMode) => void
    toggleUiMode: () => void
    setBrowseLocked: (locked: boolean) => void
    selectNode: (nodeId: string | null) => void
    selectVisualizationView: (viewId: string | null) => void
    setShowGeneratedClassDiagramInterfaces: (show: boolean) => void
    selectInterface: (interfaceUuid: string | null) => void
    clearParseError: () => void
    markSaved: (snapshot: string) => void
}

export const createUiSlice: StateCreator<SystemState, [], [], UiSlice> = (set) => ({
    uiMode: 'browse',
    browseLocked: false,
    selectedNodeId: null,
    activeVisualizationViewId: null,
    showGeneratedClassDiagramInterfaces: true,
    selectedInterfaceUuid: null,
    parseError: null,
    savedSnapshot: null,
    setUiMode: (uiMode) => set({ uiMode }),
    toggleUiMode: () =>
        set((state) => {
            if (state.browseLocked) return {}
            return { uiMode: state.uiMode === 'browse' ? 'edit' : 'browse' }
        }),
    setBrowseLocked: (locked) => set({ browseLocked: locked }),
    selectNode: (nodeId) =>
        set((state) => {
            if (nodeId === state.selectedNodeId) return {}
            return {
                selectedNodeId: nodeId,
                activeVisualizationViewId: null,
                parseError: null,
            }
        }),
    selectVisualizationView: (viewId) => set({ activeVisualizationViewId: viewId }),
    setShowGeneratedClassDiagramInterfaces: (show) =>
        set({ showGeneratedClassDiagramInterfaces: show }),
    selectInterface: (interfaceUuid) => set({ selectedInterfaceUuid: interfaceUuid }),
    clearParseError: () => set({ parseError: null }),
    markSaved: (snapshot) => set({ savedSnapshot: snapshot }),
})
```

- [ ] **Step 2: Update `TreeToolbar.tsx`**

Make these targeted changes to `src/components/tree/TreeToolbar.tsx`:

**a) Remove `ArrowLeft`, `ArrowRight` from the lucide-react import:**

```ts
// Before:
import {
    Download,
    Upload,
    RotateCcw,
    Undo2,
    Redo2,
    ArrowLeft,
    ArrowRight,
    CircleHelp,
} from 'lucide-react'

// After:
import {
    Download,
    Upload,
    RotateCcw,
    Undo2,
    Redo2,
    CircleHelp,
} from 'lucide-react'
```

**b) Remove `goBack`, `goForward`, `canNavBack`, `canNavForward` from the `useShallow` selector:**

```ts
// Before:
    const {
        rootComponent,
        setSystem,
        clearSystem,
        undo,
        redo,
        goBack,
        goForward,
        savedSnapshot,
        markSaved,
        canNavBack,
        canNavForward,
        uiMode,
        toggleUiMode,
        browseLocked,
        setBrowseLocked,
    } = useSystemStore(
        useShallow((s) => ({
            rootComponent: s.rootComponent,
            setSystem: s.setSystem,
            clearSystem: s.clearSystem,
            undo: s.undo,
            redo: s.redo,
            goBack: s.goBack,
            goForward: s.goForward,
            savedSnapshot: s.savedSnapshot,
            markSaved: s.markSaved,
            canNavBack: s.canNavBack,
            canNavForward: s.canNavForward,
            uiMode: s.uiMode,
            toggleUiMode: s.toggleUiMode,
            browseLocked: s.browseLocked,
            setBrowseLocked: s.setBrowseLocked,
        }))
    )

// After:
    const {
        rootComponent,
        setSystem,
        clearSystem,
        undo,
        redo,
        savedSnapshot,
        markSaved,
        uiMode,
        toggleUiMode,
        browseLocked,
        setBrowseLocked,
    } = useSystemStore(
        useShallow((s) => ({
            rootComponent: s.rootComponent,
            setSystem: s.setSystem,
            clearSystem: s.clearSystem,
            undo: s.undo,
            redo: s.redo,
            savedSnapshot: s.savedSnapshot,
            markSaved: s.markSaved,
            uiMode: s.uiMode,
            toggleUiMode: s.toggleUiMode,
            browseLocked: s.browseLocked,
            setBrowseLocked: s.setBrowseLocked,
        }))
    )
```

**c) Remove `Alt+←` / `Alt+→` shortcuts from the `onKeyDown` handler. Also remove the `treeActive` prop reference since it was only used for the nav shortcuts.** The `treeActive` prop is passed in from `TreeView` — we can remove it from the component entirely or keep it (it's harmless). To keep the diff minimal, remove it from the keyboard handler but leave the prop in place if it has other uses. Check the existing code: `treeActive` is ONLY used in the `Alt+←`/`Alt+→` handlers. Remove the prop from `TreeToolbarProps` and from its usage in `TreeView.tsx`.

In `TreeToolbar.tsx`, change `TreeToolbarProps`:
```ts
// Before:
interface TreeToolbarProps {
    /** Ref tracking whether the tree panel is "active" (for keyboard shortcuts). */
    treeActive: React.RefObject<boolean>
}

export const TreeToolbar = ({ treeActive }: TreeToolbarProps) => {

// After:
export const TreeToolbar = () => {
```

And in the `onKeyDown` handler, remove the two `Alt+Arrow` blocks:
```ts
// Before:
        const onKeyDown = (e: KeyboardEvent) => {
            if (
                e.target instanceof HTMLTextAreaElement ||
                e.target instanceof HTMLInputElement ||
                (e.target instanceof HTMLElement && !!e.target.closest('.cm-editor'))
            )
                return
            const mod = e.metaKey || e.ctrlKey
            if (!readOnly && mod && !e.shiftKey && e.key === 'z') {
                e.preventDefault()
                undo()
            }
            if (!readOnly && mod && e.shiftKey && e.key === 'z') {
                e.preventDefault()
                redo()
            }
            if (e.altKey && e.key === 'ArrowLeft' && treeActive.current) {
                e.preventDefault()
                goBack()
            }
            if (e.altKey && e.key === 'ArrowRight' && treeActive.current) {
                e.preventDefault()
                goForward()
            }
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [readOnly, undo, redo, goBack, goForward, treeActive])

// After:
        const onKeyDown = (e: KeyboardEvent) => {
            if (
                e.target instanceof HTMLTextAreaElement ||
                e.target instanceof HTMLInputElement ||
                (e.target instanceof HTMLElement && !!e.target.closest('.cm-editor'))
            )
                return
            const mod = e.metaKey || e.ctrlKey
            if (!readOnly && mod && !e.shiftKey && e.key === 'z') {
                e.preventDefault()
                undo()
            }
            if (!readOnly && mod && e.shiftKey && e.key === 'z') {
                e.preventDefault()
                redo()
            }
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [readOnly, undo, redo])
```

**d) Remove the back/forward buttons from the JSX.** Find and remove:
```tsx
// Remove these two buttons entirely:
                <button
                    onClick={goBack}
                    disabled={!canNavBack}
                    className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Go back (Alt+←)"
                >
                    <ArrowLeft size={16} />
                </button>
                <button
                    onClick={goForward}
                    disabled={!canNavForward}
                    className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Go forward (Alt+→)"
                >
                    <ArrowRight size={16} />
                </button>
```

**e) Update `handleLoad` to redirect to `/file` instead of `/`:**
```ts
// Before:
            if (window.location.pathname !== '/' || window.location.search !== '') {
                window.location.href = '/'
            }

// After:
            if (!window.location.pathname.startsWith('/file') || window.location.search !== '') {
                window.location.href = '/file'
            }
```

- [ ] **Step 3: Remove `treeActive` prop from `TreeView.tsx`**

In `src/components/TreeView.tsx`, remove the `treeActive` ref and its passing to `TreeToolbar`:

```tsx
// Remove these lines:
    const treeRef = useRef<HTMLDivElement>(null)
    const treeActive = useRef(false)

    // Track whether the tree panel is "active" (last interacted with).
    useEffect(() => {
        const onPointer = (e: PointerEvent) => {
            treeActive.current = !!(
                treeRef.current &&
                e.target instanceof globalThis.Node &&
                treeRef.current.contains(e.target)
            )
        }
        document.addEventListener('pointerdown', onPointer)
        return () => document.removeEventListener('pointerdown', onPointer)
    }, [])

    // Navigating to a node via a diagram link also activates the tree.
    useEffect(() => {
        if (selectedNodeId) treeActive.current = true
    }, [selectedNodeId])
```

Change the `TreeToolbar` usage from:
```tsx
<TreeToolbar treeActive={treeActive} />
```
to:
```tsx
<TreeToolbar />
```

Also remove `treeRef` from the outer div: `<div ref={treeRef} className="contents">` becomes `<div className="contents">`.

- [ ] **Step 4: Update `TreeToolbar.test.tsx`**

Remove `goBack`, `goForward`, `canNavBack`, `canNavForward` from the mock state object in `setupStoreMock`:

```ts
// Before:
    const state = {
        rootComponent: { ... },
        setSystem: vi.fn(),
        clearSystem: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        goBack: vi.fn(),
        goForward: vi.fn(),
        savedSnapshot: 'snapshot',
        markSaved: vi.fn(),
        canNavBack: false,
        canNavForward: false,
        past: [],
        future: [],
        uiMode,
        toggleUiMode: mockToggleUiMode,
    }

// After:
    const state = {
        rootComponent: { ... },
        setSystem: vi.fn(),
        clearSystem: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        savedSnapshot: 'snapshot',
        markSaved: vi.fn(),
        past: [],
        future: [],
        uiMode,
        toggleUiMode: mockToggleUiMode,
        browseLocked: false,
        setBrowseLocked: vi.fn(),
    }
```

Also update the test `'hides undo, redo, save, and clear in browse mode'` to remove any back/forward button assertions if present (check the test — they weren't asserting on the back/forward buttons so no change needed there).

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/store/slices/ src/components/tree/
```

Expected: all PASS

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run
```

Expected: no failures

- [ ] **Step 7: Fix any lint errors**

```bash
npm run lint:fix
```

- [ ] **Step 8: Commit**

```bash
git add src/store/slices/uiSlice.ts src/components/tree/TreeToolbar.tsx src/components/tree/TreeToolbar.test.tsx src/components/TreeView.tsx
git commit -m "feat: remove in-app back/forward nav; browser history replaces it [2026-04-09-url-entity-navigation.md:Task 6]"
```

---

## Final verification

- [ ] **Run the full test suite one last time**

```bash
npx vitest run
```

Expected: all tests pass, no regressions.

- [ ] **Run lint**

```bash
npm run lint:fix
npm run lint
```

Expected: no errors or warnings.
