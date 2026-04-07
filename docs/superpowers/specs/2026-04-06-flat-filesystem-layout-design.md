# Flat Filesystem Layout Design

**Date:** 2026-04-06

## Summary

Remove the `<rootId>/` subdirectory from the descendant file layout so that all component YAML files are flat in a single directory. Filenames remain `${parentId}-${selfId}.yaml`. URL loading keeps a `<rootId>/` path prefix on the server, but filenames are identical to the filesystem.

---

## File Layout

### Filesystem (File System Access API)

All files written directly to the user-chosen directory — no subdirectory created.

```
<chosen-dir>/
  <rootId>.yaml                          ← root component
  <rootId>-<selfId>.yaml                 ← direct children of root
  <parentId>-<selfId>.yaml               ← deeper descendants (no rootId prefix)
```

Example:
```
<chosen-dir>/
  demo-system.yaml
  demo-system-auth-service.yaml
  demo-system-order-service.yaml
  auth-service-user-service.yaml
```

### URL Loading (`public/models/`)

Root component lives under a `<rootId>/` subdirectory on the server. All descendant files are flat within that subdirectory. Filenames are identical to the filesystem layout.

```
public/models/
  <rootId>/
    <rootId>.yaml
    <rootId>-<selfId>.yaml
    <parentId>-<selfId>.yaml
```

Example:
```
public/models/
  demo-system/
    demo-system.yaml
    demo-system-auth-service.yaml
    demo-system-order-service.yaml
    auth-service-user-service.yaml
```

### `subComponents` field in YAML

Always stores bare filenames (no directory prefix):
```yaml
subComponents:
  - demo-system-auth-service.yaml
  - demo-system-order-service.yaml
```

---

## Code Changes

### `descendantPath` (`src/utils/systemFiles.ts`)

Remove `rootId` parameter. Return `${parentId}-${selfId}.yaml`.

**Before:** `descendantPath(rootId, parentId, selfId)` → `${rootId}/${parentId}-${selfId}.yaml`  
**After:** `descendantPath(parentId, selfId)` → `${parentId}-${selfId}.yaml`

### `flattenToFiles`

Child paths computed as `descendantPath(comp.id, child.id)`.

### `saveToDirectory`

- Remove subdirectory creation (`getDirectoryHandle`).
- Write all files (root + descendants) directly to `dir`.
- Stale cleanup: scan `dir` for `.yaml` files not in the expected set, remove them.
- `previousRootId` cleanup: remove only `${previousRootId}.yaml` (no subdir to remove).

### `loadFromDirectory`

- Read all `.yaml` files directly from `dir` (no subdirectory traversal).
- Key `fileMap` by bare filename.

### `loadFromUrl`

- Root path: `${rootId}.yaml` (bare filename, keyed in `fileMap` this way).
- `fetchComponentTree` fetches `${MODELS_BASE_PATH}/${rootId}/${relativePath}` (prepends `${rootId}/` to resolve server path).
- `fileMap` keyed by bare filename throughout.

### JSDoc comment at top of `systemFiles.ts`

Update to reflect the new flat layout.

---

## Demo Files (`public/models/demo-system/`)

Files stay in `demo-system/` directory. Only change: update `subComponents` in `demo-system.yaml` from full paths to bare filenames.

**Before:**
```yaml
subComponents:
  - demo-system/demo-system-auth-service.yaml
  - demo-system/demo-system-order-service.yaml
```

**After:**
```yaml
subComponents:
  - demo-system-auth-service.yaml
  - demo-system-order-service.yaml
```

No file renames needed (current filenames already match the new convention).

---

## Tests (`src/utils/systemFiles.test.ts`)

- Update `descendantPath` tests: remove `rootId` arg, expect bare filename.
- Update `flattenToFiles` tests: expected paths are bare filenames.
- Update `assembleTree` tests: `fileMap` keys are bare filenames.
- Update `saveToDirectory` tests: no subdirectory mock; files written to root dir mock; stale cleanup scans root dir.
- Update `loadFromDirectory` tests: flat directory mock (no subdirs).
- Update `loadFromUrl` tests: fetch URLs use `${MODELS_BASE_PATH}/${rootId}/${filename}`; `subComponents` in fixture YAMLs are bare filenames.

---

## Out of Scope

- Migration of existing saved filesystem directories (not required).
- Changes to any other part of the codebase outside `systemFiles.ts`, `systemFiles.test.ts`, and `public/models/demo-system/demo-system.yaml`.
