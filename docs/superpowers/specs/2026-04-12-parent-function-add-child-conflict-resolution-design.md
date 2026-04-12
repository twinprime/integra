# Sequence Diagram Parent Function Add: Resolve Conflicting Child-Added Functions

**Date:** 2026-04-12

## Problem

When saving a sequence diagram, Integra already pauses on function-signature changes that would
affect existing definitions and can remove redundant child-local inherited-interface functions when
the user confirms.

A missing case remains when the save would **add a new function to an existing parent/local
interface**, while one or more descendant inherited interfaces already contain **child-added
functions with the same `id` but a different signature**.

Current behavior in that case is incomplete:

1. the conflict prompt does not clearly list the descendant child interfaces that conflict
2. applying the change does not fully redirect existing references away from the removed child-local
   functions to the newly added parent function

The desired behavior is:

1. show a single conflict prompt that lists the conflicting child interfaces
2. if the user confirms, add the new parent function
3. remove the conflicting child-local functions from inherited child interfaces
4. rewrite existing references that targeted those removed child-local functions so they now resolve
   to the new parent function/signature

## Scope

This design applies only to the **sequence-diagram save flow**.

It triggers only when all of the following are true:

- the edited diagram would add a **new** function to an already-existing local interface on the
  owning component
- one or more descendant inherited interfaces resolve from that parent interface
- those descendant inherited interfaces contain child-local functions with the same `functionId`
  but a different signature

Out of scope:

- manual component-editor function creation
- interface inheritance merge conflicts
- parent function rename conflicts in `ComponentEditor`
- exact child-local signature matches that are already handled by the existing redundant-function
  flow

## Design

### 1. Extend sequence-diagram analysis to detect parent-add conflicts

`analyzeSequenceDiagramChanges()` currently reports conflicts only when the edited message already
resolves to an existing function reference.

Add a second detection path for **would-add** cases:

1. resolve the message owner component/interface using the same ownership rules already used by
   `applyMessageToComponents()` / `applyFunctionToComponentByUuid()`
2. if the target interface does not yet contain the function, classify the change as a pending
   addition instead of exiting early
3. if the target interface is local, gather descendant inherited-interface conflicts with
   `findParentInterfaceChildConflicts(root, parentInterfaceUuid, functionId, newParams)`
4. when conflicts exist, emit a new function-match variant for the dialog

Recommended new match shape:

```ts
type FunctionMatch =
    | ExistingIncompatibleMatch
    | ExistingRedundantMatch
    | ParentAdditionConflictMatch

type ParentAdditionConflictMatch = {
    kind: 'parent-add-conflict'
    parentComponentUuid: string
    parentInterfaceUuid: string
    interfaceId: string
    functionId: string
    newParams: ReadonlyArray<Parameter>
    conflictingChildFunctions: ReadonlyArray<InheritedChildFunctionConflict>
    affectedDiagramUuids: string[]
}
```

`affectedDiagramUuids` should be the union of every sequence diagram that currently references any
conflicting child function UUID. This is the set of diagrams whose message text must be rewritten
when the user applies the change.

### 2. Surface the affected child interfaces in `FunctionUpdateDialog`

Extend `FunctionUpdateDialog` to render `kind === 'parent-add-conflict'`.

The dialog should:

- keep the existing modal title (`Function Definition Conflict`)
- explain that applying the change will add the parent function and remove conflicting child-added
  definitions
- list the conflicting child interfaces in a readable form, at minimum
  `componentName · interfaceId:functionId`
- optionally show the new parent signature alongside the impacted child interfaces for clarity

This keeps all sequence-diagram save conflicts in one dialog instead of introducing a second modal
just for parent-add cases.

### 3. Apply path must rewrite references, not just delete child-local functions

For `parent-add-conflict`, the apply path must do more than `removeFunctionsFromInterfaces()`.

Required behavior:

1. write the edited current diagram content into the tree
2. rewrite every affected diagram that references one of the conflicting child functions so its
   message text uses the new parent signature
3. remove the conflicting child-local function UUIDs from inherited interfaces
4. reparse the updated system so those rewritten messages now resolve to the newly added parent
   function instead of the removed child-local functions

The key requirement is that **reference redirection is model-level, not only text-level**:

- diagram content must show the new signature
- `referencedFunctionUuids` must be recomputed so they point at the new parent function UUID

### 4. Use a full-system rebuild for this flow

`tryReparseContent()` only reparses the current diagram. That is sufficient for ordinary
single-function signature edits, but not for this case because other diagrams that referenced the
removed child-local functions must also be rebound to the new parent function UUID.

For any decision batch containing `parent-add-conflict`, `applyFunctionUpdates()` should:

1. update the current and affected diagram contents in memory
2. remove the conflicting child-local function UUIDs
3. rebuild all diagrams from content using `rebuildSystemDiagrams()`

This guarantees that all updated diagrams are reparsed against the canonical post-change tree and
their function references resolve consistently.

### 5. Preserve function metadata during the rebuild

Because this flow needs a whole-system rebuild, the implementation must preserve the metadata
invariant documented in `docs/developer-guide.md`:

> Reparsing sequence diagrams must preserve user-authored metadata.

`tryReparseContent()` already snapshots and merges function metadata before/after reparse. Extract
that snapshot/merge logic into reusable helpers in `systemOps.ts` so `applyFunctionUpdates()` can
reuse it around the full-system rebuild path.

The rebuild path should therefore be:

1. snapshot function metadata from the pre-change system
2. apply content rewrites + child-function removals
3. rebuild all diagrams
4. merge preserved function metadata back onto the rebuilt functions

### 6. Decision handling

Extend `FunctionDecision` handling in `diagramSlice.ts` with a `parent-add-conflict` branch.

That branch should:

- collect all conflicting child function UUIDs for removal
- rewrite each affected diagram with `replaceSignatureInContent(interfaceId, functionId, newParams)`
- persist the edited current diagram content
- switch to the full rebuild path described above

Existing `update-existing` and `remove-redundant` behavior should stay unchanged unless the final
implementation chooses to unify all multi-diagram reference rewrites behind the same rebuild helper.

## Tests

Add or update tests for the following scenarios:

| # | Scenario | Expected |
|---|---|---|
| 1 | `analyzeSequenceDiagramChanges()` sees a new parent function add that conflicts with child-local same-id different-signature functions | returns one `parent-add-conflict` match with all conflicting child interfaces listed |
| 2 | `FunctionUpdateDialog` renders a parent-add conflict | shows the conflict explanation and the conflicting child interface list |
| 3 | Applying a parent-add conflict with one affected child diagram | parent function is created, child-local function is removed, affected diagram content uses new signature, affected diagram `referencedFunctionUuids` points at parent function UUID |
| 4 | Applying a parent-add conflict with multiple affected child diagrams | all affected diagrams are rewritten/rebound, not just the current one |
| 5 | Canceling the dialog | no content changes and no functions removed |
| 6 | Metadata preservation | function descriptions / parameter descriptions survive the rebuild path |

## Files Expected To Change

| File | Change |
|---|---|
| `src/parser/sequenceDiagram/systemUpdater.ts` | detect parent-add conflict matches in analysis |
| `src/parser/sequenceDiagram/systemUpdaterHelpers.ts` | share owner/addition detection helpers as needed |
| `src/components/FunctionUpdateDialog.tsx` | render parent-add conflict details |
| `src/components/FunctionUpdateDialog.test.tsx` | add parent-add conflict dialog coverage |
| `src/store/slices/diagramSlice.ts` | apply parent-add conflict decisions and trigger rebuild |
| `src/store/systemOps.ts` | extract reusable metadata snapshot/merge helpers for full rebuild flow |
| `src/parser/sequenceDiagram/systemUpdater.test.ts` | add analyzer coverage for parent-add conflicts |
| `src/store/useSystemStore.test.ts` | add apply-path coverage for reference rewrites and rebinding |
