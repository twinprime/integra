# Flat model path layout design

## Problem

The current component filesystem format mixes a top-level root file with descendant files inside a root-id-named subdirectory. `/models` URL loading also uses a different entry-point convention from the saved filesystem layout. We want one flat layout with one YAML file per component, no subdirectories, and matching path expectations for both filesystem save/load and `/models` loading.

Migration for previously saved models is out of scope.

## Goals

- Store the root component in `root.yaml` regardless of the root component id.
- Store every descendant component as a top-level YAML file in the same directory.
- Prefix descendant filenames with the full parent chain using a literal `root-` prefix.
- Make `/models/<modelId>` load the same relative file paths as directory save/load.
- Remove code that creates, reads, or cleans up subdirectories for component persistence.

## Non-goals

- Backward compatibility with the old nested filesystem layout.
- Reading legacy `/models` paths.
- Model-schema changes beyond the component path strings stored in `subComponents`.

## File naming rules

### Root component

- Filename: `root.yaml`
- This does not depend on the root component id.

### Descendant components

- Filename format: `root-<ancestor-1>-<ancestor-2>-...-<self>.yaml`
- The `root` prefix is the literal string `root`.
- The actual root component id is not included in descendant filenames.
- Each descendant filename includes the full ancestor chain from the root's direct child down to the component itself.

Examples:

- root child `gateway` → `root-gateway.yaml`
- grandchild `auth` under `gateway` → `root-gateway-auth.yaml`
- great-grandchild `token` under `gateway/auth` → `root-gateway-auth-token.yaml`

## Stored YAML references

Each component YAML continues to store `subComponents` as a list of relative file paths, but those paths now use the flat filenames above.

Examples:

- `root.yaml` may contain `subComponents: [root-gateway.yaml]`
- `root-gateway.yaml` may contain `subComponents: [root-gateway-auth.yaml, root-gateway-orders.yaml]`

This keeps the serialized structure explicit while remaining independent of nested directories.

## `/models` loading contract

The model route remains `/models/<modelId>`, where `<modelId>` selects the model namespace under `public/models`.

Within that namespace, all component fetches use the same relative paths as the saved filesystem layout:

- root file: `/models/<modelId>/root.yaml`
- descendant examples:
  - `/models/<modelId>/root-gateway.yaml`
  - `/models/<modelId>/root-gateway-auth.yaml`

`loadFromUrl(modelId)` starts from `root.yaml`, then recursively fetches any descendant paths listed in `subComponents`.

## Implementation approach

The change stays centered in `src/utils/systemFiles.ts`.

### Path helpers

- Replace the current root-id-based filename helpers with flat-layout helpers.
- Use one shared helper flow to derive:
  - `root.yaml`
  - descendant filenames from an ancestor id chain

### Flattening for save

- Update `flattenToFiles()` so each `FileEntry.relativePath` is a flat filename.
- Build descendant child paths from the parent chain, not from `rootId/<parent>-<self>.yaml`.

### Directory save

- Stop creating `<rootId>/` subdirectories.
- Write all YAML files directly into the chosen directory.
- Remove stale top-level `.yaml` component files that are no longer expected.
- Keep cleanup for renamed root files limited to the old top-level root filename if needed by the current save flow, but remove subdirectory cleanup because subdirectories are no longer part of the format.

### Directory load

- Read top-level `.yaml` component files only.
- Treat the single top-level root file as `root.yaml`.
- Resolve descendants by matching the flat filenames referenced from `subComponents`.
- Remove logic that scans nested directories for descendant files.

Because migration is out of scope, the loader does not need to reconstruct or support the previous nested layout.

### URL load

- Change `loadFromUrl()` to fetch `root.yaml` within the selected model namespace.
- Reuse the same relative paths recorded in `subComponents` when fetching descendants.

## Affected files

- `src/utils/systemFiles.ts`
- `src/utils/systemFiles.test.ts`
- `public/models/**` fixtures used by `/models` loading
- `e2e/model-route.spec.ts` if it encodes the old fetch paths
- `README.md` only if it currently describes the old persistence layout

## Validation

- Update unit tests around path helpers, flattening, directory save/load, and URL loading.
- Update any fixture paths and route intercepts that still assume nested component directories.
- Run the existing repository validation commands after implementation.

## Risks and mitigations

### Ambiguous filename generation

Risk: descendant naming could drift between save/load and URL loading.

Mitigation: centralize filename generation in shared helpers and use those helpers in all persistence code paths.

### Stale files in saved directories

Risk: obsolete YAML files from a prior save remain beside the new flat layout.

Mitigation: compute the full expected top-level YAML set during save and remove stale component YAML files that are not part of the current export.

### Legacy layouts being selected accidentally

Risk: users choose an old nested-layout directory and get confusing results.

Mitigation: since migration is out of scope, load only the new flat layout and fail clearly when required flat-layout files are missing.
