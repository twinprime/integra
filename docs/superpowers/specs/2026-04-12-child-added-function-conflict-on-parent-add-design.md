# Design: Child-Added Function Conflict Detection When Adding a Function to a Parent Interface

**Date:** 2026-04-12  
**Status:** Approved

---

## Problem

When a new function is added to a local (parent) interface via the sequence diagram parser, descendant inherited interfaces may already carry a "child-added" function with the same ID. Two cases arise:

- **Redundant** (same ID + same params): the child-added function is now fully covered by the parent — it should be removed silently.
- **Incompatible** (same ID + different params): the parent and child disagree on the contract — the addition must be blocked with a clear error.

Neither case is currently handled. The existing `findConflictingInheritedChildFunctions` utility only finds exact-match (redundant) child-added functions and is only wired into the rename flow.

---

## Scope

- Triggered only when a **new** function (not previously on the interface) is added to a **local** interface by the sequence diagram parser.
- Inherited interfaces and same-interface incompatibilities are handled by existing code and are unchanged.
- No new UI components are introduced; the error surfaces as an inline parse error in the DiagramEditor.

---

## Design

### Section 1 — New utility: `findChildAddedFunctionConflictsForNewParentFunction`

**Location:** `src/utils/interfaceFunctions.ts`

Walks all descendant components of `rootComponent`, finds every inherited interface that descends (directly or transitively) from `parentInterfaceUuid`, and scans each one's stored `functions` (the child-added functions) for entries whose `id` matches `functionId`. Each match is classified:

```ts
type ChildAddedFunctionConflicts = {
  redundant: ReadonlyArray<InheritedChildFunctionConflict>   // same ID + same params
  incompatible: ReadonlyArray<InheritedChildFunctionConflict> // same ID + different params
}

function findChildAddedFunctionConflictsForNewParentFunction(
  rootComponent: ComponentNode,
  parentInterfaceUuid: string,
  functionId: string,
  newParams: ReadonlyArray<InterfaceFunction['parameters'][number]>
): ChildAddedFunctionConflicts
```

Uses the existing `inheritsFromInterface` helper (already in the file) and `paramsMatch` / `classifyFunctionCompatibility` for classification. Uses the existing `InheritedChildFunctionConflict` type, which carries `componentName`, `interfaceId`, `functionId`, and `functionUuid` — enough for both removal and error formatting.

---

### Section 2 — Updated `applyFunctionToComponentByUuid`

**Location:** `src/parser/sequenceDiagram/systemUpdaterHelpers.ts`

The function is restructured to add three steps when a function would be added for the first time to a local interface:

**Step 1 — Pre-classify**  
Before `upsertNodeInTree`, use `classifyFunctionCompatibility` against the current interface's stored functions. If `kind === 'distinct'` and the interface is local, proceed to the conflict check. Otherwise (match, incompatible on same interface, or inherited interface), fall through to existing logic unchanged.

**Step 2 — Conflict check**  
Call `findChildAddedFunctionConflictsForNewParentFunction` with the current `root` and the interface UUID.

- If `incompatible.length > 0`: throw an `Error` with the message format described in Section 3. This propagates as an inline parse error in the DiagramEditor — no new UI is needed.
- If `incompatible.length === 0` and `redundant.length > 0`: collect redundant function UUIDs for removal in step 3.

**Step 3 — Apply + cleanup**  
Run `upsertNodeInTree` as before to add the function. If redundant UUIDs were collected, call `removeFunctionsFromInterfaces` on the resulting root with those UUIDs. Return the cleaned-up root.

Pseudo-flow:

```
classify function against current interface
├── kind = 'match' or 'incompatible' (same interface) → existing behaviour unchanged
├── kind = 'distinct' and interface is inherited → existing behaviour unchanged
└── kind = 'distinct' and interface is local
    ├── findChildAddedFunctionConflictsForNewParentFunction(root, ifaceUuid, fnId, params)
    ├── incompatible.length > 0 → throw Error (blocked)
    └── else
        ├── upsertNodeInTree → add function
        └── redundant.length > 0 → removeFunctionsFromInterfaces(result, redundantUuids)
```

---

### Section 3 — Error message format

```
Cannot add function '<functionId>(<params>)' to interface '<interfaceId>':
  - <ComponentName>.<interfaceId>: child-added '<functionId>(<childParams>)'
  - <ComponentName>.<interfaceId>: child-added '<functionId>(<childParams>)'
```

`formatFunctionSignature` (already in `interfaceFunctions.ts`) is used for both the new parent function signature and each conflicting child-added signature.

Example:

```
Cannot add function 'submit(payload: Order)' to interface 'ICheckout':
  - PaymentGateway.ICheckout: child-added 'submit(payload: Order, currency: string)'
```

---

### Section 4 — Testing

**`src/utils/interfaceFunctions.test.ts`** — unit tests for `findChildAddedFunctionConflictsForNewParentFunction`:

- Returns empty buckets when there are no descendant inherited interfaces
- Correctly buckets a redundant child-added function (same ID + same params)
- Correctly buckets an incompatible child-added function (same ID + different params)
- Handles multi-level inheritance (grandchild components)
- Ignores child-added functions with a different function ID
- Handles a mix of redundant and incompatible across multiple children

**`src/parser/sequenceDiagram/systemUpdaterHelpers.test.ts`** (or existing updater test file) — integration tests for `applyFunctionToComponentByUuid`:

- Adds function normally when there are no child-added conflicts
- Throws with the correct error message format when an incompatible child-added function exists, listing all affected child interfaces
- Silently removes redundant child-added functions after adding the parent function
- Does not remove child-added functions from unrelated interfaces or other functions
- Leaves inherited interfaces and same-interface incompatibility behaviour unchanged

---

## Invariants preserved

- Parent functions remain authoritative; child-local inherited functions are additive — this change enforces that invariant at the point of parent function creation.
- Components are updated immutably: `removeFunctionsFromInterfaces` returns new objects.
- No mutation of nested arrays.
