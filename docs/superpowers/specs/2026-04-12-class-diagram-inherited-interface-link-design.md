# Class Diagram: Link Out-of-Scope Sub-Component Calls to Inherited Ancestor Interface

**Date:** 2026-04-12

## Problem

When generating class diagrams from use-case / use-case-diagram / sequence-diagram references,
messages that target a sub-component outside the diagram's scope are currently resolved to a plain
dependency edge pointing at the visible ancestor **component**. This is correct in general, but
loses information when the called function is actually defined on an interface that the
sub-component inherits from that visible ancestor. In that case the diagram should link to the
**ancestor interface** instead and show the function in its method list.

## Scope

Only applies when:
- `options.showInterfaces` is `true`
- The resolved receiver is a sub-component outside diagram scope (i.e. `visibleReceiverMatchesActual === false`)
- The sub-component's interface is an `InheritedInterfaceSpecification`
- The called `functionId` is **not** in the sub-component's local `functions` array (i.e. it is not
  a function the child added to the inherited interface)

If any condition fails the existing fallback (dependency edge to parent component) is used unchanged.

## Design

### 1. New resolver — `diagramResolvers.ts`

Add one exported function:

```ts
export function resolveInheritedAncestorInterfaceOnComponent(
    subComponentUuid: string,
    interfaceUuid: string,
    functionId: string,
    targetComponentUuid: string,
    rootComponent: ComponentNode
): { componentUuid: string; interfaceUuid: string } | null
```

**Walk logic** (recursive, terminates on any failure):

1. Find the interface by `interfaceUuid` on the component identified by `subComponentUuid`.
2. If it is not an `InheritedInterfaceSpecification` → return `null`.
3. If `functionId` is present in `iface.functions` (locally added at this level) → return `null`.
4. Call `getParentInterfaceResolution(iface, component, rootComponent)` to get
   `{ parentComponent, parentInterface }`.
5. If `parentComponent.uuid === targetComponentUuid` → return
   `{ componentUuid: parentComponent.uuid, interfaceUuid: parentInterface.uuid }`.
6. Otherwise recurse with `parentComponent.uuid` / `parentInterface.uuid` as the new current
   level (handles multi-level inheritance chains; intermediate levels that locally add the
   function also cause an early `null` return via step 3).

Returns `null` in all stop/failure cases so the call site can fall back gracefully.

### 2. `unifiedClassDiagram.ts` — call site change

In `buildClassDiagramGraph`, immediately before the existing fallback
`addDependencyEdge(sender → visibleTargetNode)`, insert:

```ts
if (!visibleReceiverMatchesActual && options.showInterfaces) {
    const ancestorIfaceTarget = resolveInheritedAncestorInterfaceOnComponent(
        resolvedTarget.componentUuid,
        resolvedTarget.interfaceUuid,
        functionId,
        visibleTargetUuid,
        rootComponent
    )
    if (ancestorIfaceTarget) {
        const ancestorIfaceNode = ensureInterfaceNode(
            ancestorIfaceTarget.componentUuid,
            ancestorIfaceTarget.interfaceUuid
        )
        if (ancestorIfaceNode?.kind === 'interface') {
            const calledIds =
                interfaceMethodIds.get(ancestorIfaceNode.nodeId) ?? new Set<string>()
            calledIds.add(functionId)
            interfaceMethodIds.set(ancestorIfaceNode.nodeId, calledIds)
            addDependencyEdge(
                senderNodeDefinition.nodeId,
                ancestorIfaceNode.nodeId,
                senderNodeDefinition.name,
                ancestorIfaceNode.name,
                sequenceDiagram,
                functionId
            )
            continue
        }
    }
}
// existing fallback unchanged
addDependencyEdge(sender → visibleTargetNode, ...)
```

No changes are needed to the implementation-edge loop (lines 334–357): it already adds
`component ..|> interface` edges for any interface that ends up in
`interfaceNodeIdsWithDependencies`, so the ancestor interface is picked up automatically.

`visibleTargetNode` (the component) is already ensured earlier in the loop; this path does not
require it to be removed or re-ensured.

### 3. Tests

New test cases in `useCaseDiagramClassDiagram.test.ts`:

| # | Scenario | Expected |
|---|---|---|
| 1 | Inherited function, parent is visible | Dependency edge → parent interface; function in method list; implementation edge component → interface |
| 2 | Child-added function on inherited interface | Fallback: dependency edge → parent component |
| 3 | Local (non-inherited) sub-component interface | Fallback: dependency edge → parent component |
| 4 | Multi-level chain (C→B→A), function not added at any intermediate | Dependency edge → A's interface |
| 5 | Multi-level chain (C→B→A), function locally added at B | Fallback: dependency edge → parent component |
| 6 | `showInterfaces: false` | Fallback: dependency edge → parent component regardless |

## Files Changed

| File | Change |
|---|---|
| `src/utils/diagramResolvers.ts` | Add `resolveInheritedAncestorInterfaceOnComponent` |
| `src/utils/unifiedClassDiagram.ts` | Insert ancestor-interface branch before fallback |
| `src/utils/useCaseDiagramClassDiagram.test.ts` | Add 6 new test cases |
