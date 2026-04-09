# URL Entity Navigation — Design Spec

**Date:** 2026-04-09  
**Status:** Approved

## Problem

The URL never reflects which entity is selected in the tree. Users cannot bookmark a specific entity or share a direct link to it.

## Goal

Update the URL whenever the selected entity changes so that visiting that URL later navigates directly to that entity.

---

## URL Structure

Entity paths use the `id` fields of the chain from root's first child down to the selected node. The root component itself has no entity segment.

| Scenario | URL pattern | Example |
|---|---|---|
| `/models` model root | `/models/<id>` | `/models/my-system` |
| `/models` entity selected | `/models/<id>/<seg1>/<seg2>/...` | `/models/my-system/auth/login-flow/checkout` |
| `/file` no entity selected | `/file` | `/file` |
| `/file` entity selected | `/file/<seg1>/<seg2>/...` | `/file/auth/login-flow/checkout` |

All node types (component, actor, use-case-diagram, use-case, sequence-diagram) participate identically — each contributes its `id` as one path segment.

The existing `/` route (localStorage-based main app) is **not** affected and receives no URL sync.

---

## Routing

`App.tsx` dispatches on pathname:

- `/models/<id>/...` → `ModelPage` (existing, extended)
- `/file/...` → `FilePage` (new)
- `/` → existing main app (unchanged)

---

## URL Synchronization

### Writing (store → URL)

A `useEntityNavigation` hook subscribes to `selectedNodeId`. On each change it:

1. Computes the entity path via `getNodeIdPath(root, uuid)` — returns `string[]` of `id` segments from root's first child to the node (empty array = root selected, null = not found).
2. Calls `history.pushState` to update the URL, adding a browser history entry so the browser's native back/forward navigate between entity selections.

This hook is mounted inside both `ModelPage` and `FilePage`.

### Browser back/forward

The hook also listens for `popstate` events (fired when the user presses browser back/forward). On each `popstate` it re-parses the entity path from the new `window.location.pathname` and calls `selectNode` with the resolved UUID (or shows the "Entity not found" state if unresolvable).

Because browser navigation now handles back/forward, **the in-app back/forward buttons are removed**, along with the associated store state (`navBack`, `navForward`, `canNavBack`, `canNavForward`, `goBack`, `goForward`) and keyboard shortcuts (`Alt+←` / `Alt+→`).

### Reading (URL → store)

On initial mount, both pages:

1. Parse the entity path segments from `window.location.pathname`.
2. Call `findNodeByIdPath(root, segments)` to resolve the node.
3. If found: call `selectNode(uuid)`.
4. If not found and segments are non-empty: show "Entity not found" state (see below).
5. If no segments: no pre-selection (`selectedNodeId` remains null).

---

## Entity Not Found

When a URL entity path cannot be resolved (entity renamed, deleted, or URL mistyped):

- The **full layout renders** — tree panel is visible and usable.
- The **right/editor panel** shows a persistent "Entity not found" message including the unresolved path (e.g., `auth/login-flow/checkout`).
- No node is pre-selected; the user picks from the tree normally.

---

## `FilePage` States

| State | What's shown |
|---|---|
| No model in localStorage / fresh session | Full layout, tree empty, right panel: "Load a model to continue" + directory picker button |
| Model loaded, entity path valid | Full layout, entity pre-selected |
| Model loaded, entity path not found | Full layout, tree visible, right panel: "Entity not found: `<path>`" |
| Model loaded, no entity in URL | Full layout, no pre-selection (`selectedNodeId` null) |

After loading a directory from `FilePage`, the URL updates to `/file/<entity-path>` (or `/file` if root selected).

---

## New Utilities in `nodeTree.ts`

```ts
/** Returns id-segment path from root's child to the node. Empty = root. Null = not found. */
function getNodeIdPath(root: ComponentNode, uuid: string): string[] | null

/** Resolves a chain of id segments to a node. Null = not found. */
function findNodeByIdPath(root: ComponentNode, segments: string[]): Node | null
```

---

## Affected Files

### New
- `src/hooks/useEntityNavigation.ts` — `selectedNodeId` ↔ URL sync hook
- `src/components/FilePage.tsx` — page for `/file/...` routes

### Modified
- `src/utils/systemFiles.ts` — add helpers to parse entity path from `/file/...` and `/models/<id>/...` pathnames
- `src/utils/nodeTree.ts` — add `getNodeIdPath` and `findNodeByIdPath`
- `src/App.tsx` — add `/file` route; wire entity path into `ModelPage` and `FilePage`
- `src/components/ModelPage.tsx` — mount `useEntityNavigation`, resolve initial entity path on load
- `src/components/tree/TreeToolbar.tsx` — redirect to `/file` (not `/`) after `handleLoad`; remove back/forward buttons and `Alt+←`/`Alt+→` keyboard shortcuts
- `src/store/slices/uiSlice.ts` — remove `navBack`, `navForward`, `canNavBack`, `canNavForward`, `goBack`, `goForward`

### Unchanged
- Node types, diagram components, `TreeView`, `TreeNode`
