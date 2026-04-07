# Flat Filesystem Layout for Saved Models

**Date:** 2026-04-07
**Status:** Approved

## Overview

Flatten the saved directory structure from a two-level layout (root file + subdirectory of descendants) to a fully flat layout where every component lives as a single file in the same directory. The URL loading path convention (`/models`) is aligned to the same filename scheme.

## Current Layout (to be replaced)

```
<chosen-dir>/
  <rootId>.yaml                        ← root component
  <rootId>/                            ← subdirectory for ALL descendants
    <parentId>-<selfId>.yaml
    ...
```

URL: `/models/<rootId>/<rootId>.yaml`, children at `/models/<rootId>/<parentId>-<selfId>.yaml`

## New Layout

```
<chosen-dir>/
  root.yaml                            ← root component (always this name)
  root-<childId>.yaml                  ← direct child of root
  root-<childId>-<grandchildId>.yaml   ← grandchild
  root-<id1>-...-<selfId>.yaml         ← any depth descendant
```

- No subdirectories.
- Root is always `root.yaml` regardless of the component's `id`.
- Descendant filenames start with the literal prefix `root-` followed by all ancestor IDs (from root's direct child downward) and the component's own ID, joined by `-`.

### Example — demo-system

| Component | Old path | New path |
|---|---|---|
| demo-system (root) | `demo-system.yaml` | `root.yaml` |
| auth-service | `demo-system/demo-system-auth-service.yaml` | `root-auth-service.yaml` |
| order-service | `demo-system/demo-system-order-service.yaml` | `root-order-service.yaml` |

### `subComponents` path references

Stored as bare filenames (e.g. `root-auth-service.yaml`). These are identical in both filesystem YAML files and URL-served YAML files.

## URL Loading (`/models` route)

- Entry point: `/models/<rootId>/root.yaml`
- Children resolved as: `/models/<rootId>/<bareFilename>`
- The `rootId` directory prefix is applied inside `fetchComponentTree`, not encoded in the `subComponents` field.

## Code Changes (`src/utils/systemFiles.ts`)

### Functions changed

**`rootFilename()`**
- Remove `rootId` parameter (no longer needed).
- Always returns `'root.yaml'`.

**`descendantPath(ancestors: string[], selfId: string)`**
- Replace `(rootId, parentId, selfId)` signature with `(ancestors: string[], selfId: string)`.
- `ancestors` is the list of component IDs from root's direct child down to the immediate parent.
- Returns `root-${[...ancestors, selfId].join('-')}.yaml`.

**`flattenToFiles(root)`**
- DFS now carries a `string[]` ancestors array (initially empty for the root visit).
- Each recursive call appends the current component's `id` to the ancestors array before visiting children.
- Root entry path: `rootFilename()`.
- Descendant entry path: `descendantPath(ancestors, comp.id)`.

**`saveToDirectory(dir, root)`**
- Remove `previousRootId` parameter — root filename is always `root.yaml` so there is nothing to rename.
- Remove all `getDirectoryHandle` / subdir creation logic.
- All files (root and descendants) are written directly to `dir`.
- Stale cleanup: iterate `dir.values()`, remove any `*.yaml` file whose name starts with `root` (i.e. matches `root.yaml` or `root-*.yaml`) and is not in the expected write set. Non-matching files are left untouched.

**`loadFromDirectory(dir)`**
- Remove subdirectory iteration logic.
- Entry point is always `root.yaml` — read it directly rather than scanning for a single top-level YAML.
- Descendant files referenced in `subComponents` are read by bare filename from `dir`.
- Build a `fileMap` keyed by bare filename; resolve recursively from the root entry.

**`loadFromUrl(rootId)`**
- Entry point: `root.yaml` (fetched as `/models/<rootId>/root.yaml`).
- Pass `rootId` into `fetchComponentTree` so child paths are resolved as `/models/<rootId>/<bareFilename>`.

### Functions removed / cleaned up

- All `getDirectoryHandle` calls and subdir creation.
- The subdirectory iteration block in `loadFromDirectory` (the `else if (entry.kind === 'directory')` branch).
- The `previousRootId` cleanup block in `saveToDirectory`.
- The two-argument `rootFilename(rootId)` call sites.

## Static Assets (`public/models/demo-system/`)

Restructure to new flat layout:

```
public/models/demo-system/
  root.yaml                        (was demo-system.yaml)
  root-auth-service.yaml           (was demo-system/demo-system-auth-service.yaml)
  root-order-service.yaml          (was demo-system/demo-system-order-service.yaml)
```

Update `subComponents` references in `root.yaml` to use bare filenames.
Remove the `demo-system/` subdirectory.

## Tests (`src/utils/systemFiles.test.ts`)

All test expectations updated to reflect new paths and signatures:

- `rootFilename` — expect `'root.yaml'` (no argument).
- `descendantPath` — new signature `(ancestors, selfId)`.
- `flattenToFiles` — expected `relativePath` and `childPaths` values updated.
- `assembleTree` — `fileMap` keys updated to bare filenames.
- `saveToDirectory` — mock uses flat dir only (no `getDirectoryHandle`); `previousRootId` tests removed; stale cleanup test updated.
- `loadFromDirectory` — mock uses flat dir with all files at top level.
- `loadFromUrl` — fetch mock URLs updated (`/models/<rootId>/root.yaml`, `/models/<rootId>/root-<child>.yaml`).

## Out of Scope

- Migration of existing saved models (not required).
- Changes outside `systemFiles.ts`, its test file, and `public/models/`.
