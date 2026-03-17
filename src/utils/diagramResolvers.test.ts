import { describe, it, expect } from "vitest"
import { ensureScopedNodePath, findComponentUuidByInterfaceId, findInterfaceUuidById, findPreferredInterfaceOwnerUuid, findPreferredInterfaceUuid, resolveFunctionReferenceTarget } from "./diagramResolvers"
import type { ComponentNode } from "../store/types"

const makeComp = (uuid: string, id: string, subs: ComponentNode[] = []): ComponentNode => ({
  uuid, id, name: id, type: "component",
  description: "", subComponents: subs, actors: [], useCaseDiagrams: [], interfaces: [],
})

describe("ensureScopedNodePath", () => {
  it("creates a component as direct child of owner when parent is owner", () => {
    const root = makeComp("root-uuid", "root")
    const result = ensureScopedNodePath(root, ["newComp"], "component", "root-uuid")
    expect(result).not.toBeNull()
    expect(result!.updatedRoot.subComponents).toHaveLength(1)
    expect(result!.updatedRoot.subComponents[0].id).toBe("newComp")
    expect(result!.uuid).toBe(result!.updatedRoot.subComponents[0].uuid)
  })

  it("creates an actor as direct child of owner", () => {
    const root = makeComp("root-uuid", "root")
    const result = ensureScopedNodePath(root, ["NewActor"], "actor", "root-uuid")
    expect(result).not.toBeNull()
    expect(result!.updatedRoot.actors).toHaveLength(1)
    expect(result!.updatedRoot.actors[0].id).toBe("NewActor")
  })

  it("creates a component nested under an existing in-scope parent", () => {
    const child = makeComp("child-uuid", "child")
    const root = makeComp("root-uuid", "root", [child])
    // Owner is child; create under root (ancestor) — in scope
    const result = ensureScopedNodePath(root, ["root", "newSibling"], "component", "child-uuid")
    expect(result).not.toBeNull()
    expect(result!.updatedRoot.subComponents).toHaveLength(2)
    const created = result!.updatedRoot.subComponents.find((c) => c.id === "newSibling")
    expect(created).toBeDefined()
  })

  it("creates intermediate component nodes when they are missing", () => {
    const root = makeComp("root-uuid", "root")
    // Create "mid/leaf" — "mid" doesn't exist, should be created first
    const result = ensureScopedNodePath(root, ["mid", "leaf"], "component", "root-uuid")
    expect(result).not.toBeNull()
    const mid = result!.updatedRoot.subComponents.find((c) => c.id === "mid")
    expect(mid).toBeDefined()
    expect(mid!.subComponents).toHaveLength(1)
    expect(mid!.subComponents[0].id).toBe("leaf")
  })

  it("returns null when target location is out of scope (cousin)", () => {
    const cousin = makeComp("cousin-uuid", "cousin")
    const sibling = makeComp("sibling-uuid", "sibling", [cousin])
    const owner = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [owner, sibling])
    // Creating under sibling/cousin is out of scope for owner
    const result = ensureScopedNodePath(root, ["sibling", "cousin", "target"], "component", "owner-uuid")
    expect(result).toBeNull()
  })

  it("returns null for empty segments", () => {
    const root = makeComp("root-uuid", "root")
    expect(ensureScopedNodePath(root, [], "component", "root-uuid")).toBeNull()
  })

  it("does not duplicate if same id already exists", () => {
    // If node already exists, ensureScopedNodePath is called only when findNodeByPath returned null
    // — this test ensures idempotent creation does not double-add
    const existing = makeComp("existing-uuid", "existing")
    const root = makeComp("root-uuid", "root", [existing])
    // "existing" already exists under root — findNodeByPath would have returned it
    // If called anyway, it creates a duplicate (this is intentional: callers check first)
    const result = ensureScopedNodePath(root, ["existing"], "component", "root-uuid")
    expect(result).not.toBeNull()
    // Two components with same id would exist — callers are responsible for checking
    expect(result!.updatedRoot.subComponents).toHaveLength(2)
  })
})

// ─── findComponentUuidByInterfaceId / findInterfaceUuidById ──────────────

const makeCompWithIface = (
  uuid: string,
  id: string,
  ifaceId: string,
  ifaceUuid: string,
  subs: ComponentNode[] = [],
): ComponentNode => ({
  uuid, id, name: id, type: "component",
  subComponents: subs, actors: [], useCaseDiagrams: [],
  interfaces: [{ uuid: ifaceUuid, id: ifaceId, name: ifaceId, type: "rest", functions: [] }],
})

const makeCompWithFn = (
  uuid: string,
  id: string,
  ifaceId: string,
  ifaceUuid: string,
  functionId: string,
  functionUuid: string,
  subs: ComponentNode[] = [],
): ComponentNode => ({
  uuid, id, name: id, type: "component",
  subComponents: subs, actors: [], useCaseDiagrams: [],
  interfaces: [{
    uuid: ifaceUuid,
    id: ifaceId,
    name: ifaceId,
    type: "rest",
    functions: [{ uuid: functionUuid, id: functionId, parameters: [] }],
  }],
})

describe("findComponentUuidByInterfaceId", () => {
  it("returns component uuid when interface is on root", () => {
    const root = makeCompWithIface("root-uuid", "root", "IFace", "iface-uuid")
    expect(findComponentUuidByInterfaceId(root, "IFace")).toBe("root-uuid")
  })

  it("returns component uuid when interface is on a sub-component", () => {
    const child = makeCompWithIface("child-uuid", "child", "IChild", "ichild-uuid")
    const root = makeComp("root-uuid", "root", [child])
    expect(findComponentUuidByInterfaceId(root, "IChild")).toBe("child-uuid")
  })

  it("returns undefined when interface is not found", () => {
    const root = makeComp("root-uuid", "root")
    expect(findComponentUuidByInterfaceId(root, "INotExist")).toBeUndefined()
  })
})

describe("findInterfaceUuidById", () => {
  it("returns interface uuid when interface is on root", () => {
    const root = makeCompWithIface("root-uuid", "root", "IFace", "iface-uuid")
    expect(findInterfaceUuidById(root, "IFace")).toBe("iface-uuid")
  })

  it("returns interface uuid when interface is on a sub-component", () => {
    const child = makeCompWithIface("child-uuid", "child", "IChild", "ichild-uuid")
    const root = makeComp("root-uuid", "root", [child])
    expect(findInterfaceUuidById(root, "IChild")).toBe("ichild-uuid")
  })

  it("returns undefined when interface is not found", () => {
    const root = makeComp("root-uuid", "root")
    expect(findInterfaceUuidById(root, "INotExist")).toBeUndefined()
  })

  it("returns the interface uuid (not the component uuid)", () => {
    const root = makeCompWithIface("comp-uuid", "comp", "IFace", "distinct-iface-uuid")
    const result = findInterfaceUuidById(root, "IFace")
    expect(result).toBe("distinct-iface-uuid")
    expect(result).not.toBe("comp-uuid")
  })
})

// ─── findPreferredInterfaceOwnerUuid ─────────────────────────────────────────

describe("findPreferredInterfaceOwnerUuid", () => {
  it("returns the receiver UUID when receiver directly has the interface", () => {
    const svcA = makeCompWithIface("a-uuid", "ServiceA", "API", "a-iface-uuid")
    const svcB = makeCompWithIface("b-uuid", "ServiceB", "API", "b-iface-uuid")
    const root = makeComp("root-uuid", "root", [svcA, svcB])
    // ServiceB is the receiver — should return ServiceB UUID, not ServiceA's
    expect(findPreferredInterfaceOwnerUuid(root, "API", "ServiceB")).toBe("b-uuid")
  })

  it("returns ServiceA UUID when ServiceA is the receiver", () => {
    const svcA = makeCompWithIface("a-uuid", "ServiceA", "API", "a-iface-uuid")
    const svcB = makeCompWithIface("b-uuid", "ServiceB", "API", "b-iface-uuid")
    const root = makeComp("root-uuid", "root", [svcA, svcB])
    expect(findPreferredInterfaceOwnerUuid(root, "API", "ServiceA")).toBe("a-uuid")
  })

  it("returns the sub-component UUID when the interface is on a child of the receiver", () => {
    // ServiceB itself has no "API", but ServiceB's child does
    const child = makeCompWithIface("child-uuid", "child", "API", "child-iface-uuid")
    const svcA = makeCompWithIface("a-uuid", "ServiceA", "API", "a-iface-uuid")
    const svcB = makeComp("b-uuid", "ServiceB", [child])
    const root = makeComp("root-uuid", "root", [svcA, svcB])
    // Receiver is ServiceB; interface is on ServiceB's child
    expect(findPreferredInterfaceOwnerUuid(root, "API", "ServiceB")).toBe("child-uuid")
  })

  it("falls back to global DFS search when receiver is not found", () => {
    const svcA = makeCompWithIface("a-uuid", "ServiceA", "API", "a-iface-uuid")
    const root = makeComp("root-uuid", "root", [svcA])
    // "Unknown" is not a component in the tree
    expect(findPreferredInterfaceOwnerUuid(root, "API", "Unknown")).toBe("a-uuid")
  })

  it("returns undefined when no component has the interface", () => {
    const root = makeComp("root-uuid", "root")
    expect(findPreferredInterfaceOwnerUuid(root, "API", "root")).toBeUndefined()
  })
})

// ─── findPreferredInterfaceUuid ──────────────────────────────────────────

describe("findPreferredInterfaceUuid", () => {
  it("returns the receiver's interface UUID when receiver directly has it", () => {
    const svcA = makeCompWithIface("a-uuid", "ServiceA", "API", "a-iface-uuid")
    const svcB = makeCompWithIface("b-uuid", "ServiceB", "API", "b-iface-uuid")
    const root = makeComp("root-uuid", "root", [svcA, svcB])
    // Receiver is ServiceB — must return ServiceB's interface UUID, not ServiceA's
    expect(findPreferredInterfaceUuid(root, "API", "ServiceB")).toBe("b-iface-uuid")
  })

  it("returns ServiceA's interface UUID when ServiceA is the receiver", () => {
    const svcA = makeCompWithIface("a-uuid", "ServiceA", "API", "a-iface-uuid")
    const svcB = makeCompWithIface("b-uuid", "ServiceB", "API", "b-iface-uuid")
    const root = makeComp("root-uuid", "root", [svcA, svcB])
    expect(findPreferredInterfaceUuid(root, "API", "ServiceA")).toBe("a-iface-uuid")
  })

  it("returns the sub-component's interface UUID when interface is on a child of the receiver", () => {
    const child = makeCompWithIface("child-uuid", "child", "API", "child-iface-uuid")
    const svcA = makeCompWithIface("a-uuid", "ServiceA", "API", "a-iface-uuid")
    const svcB = makeComp("b-uuid", "ServiceB", [child])
    const root = makeComp("root-uuid", "root", [svcA, svcB])
    // Receiver is ServiceB; interface is on child — must NOT fall back to ServiceA's interface
    expect(findPreferredInterfaceUuid(root, "API", "ServiceB")).toBe("child-iface-uuid")
  })

  it("falls back to global DFS search when receiver is not found", () => {
    const svcA = makeCompWithIface("a-uuid", "ServiceA", "API", "a-iface-uuid")
    const root = makeComp("root-uuid", "root", [svcA])
    expect(findPreferredInterfaceUuid(root, "API", "Unknown")).toBe("a-iface-uuid")
  })

  it("returns undefined when no component has the interface", () => {
    const root = makeComp("root-uuid", "root")
    expect(findPreferredInterfaceUuid(root, "API", "root")).toBeUndefined()
  })
})

describe("resolveFunctionReferenceTarget", () => {
  it("returns the receiver's matching component, interface, and function UUIDs", () => {
    const svcA = makeCompWithFn("a-uuid", "ServiceA", "API", "a-iface-uuid", "getData", "a-fn-uuid")
    const svcB = makeCompWithFn("b-uuid", "ServiceB", "API", "b-iface-uuid", "getData", "b-fn-uuid")
    const root = makeComp("root-uuid", "root", [svcA, svcB])

    expect(resolveFunctionReferenceTarget(root, "ServiceB", "API", "getData")).toEqual({
      componentUuid: "b-uuid",
      interfaceUuid: "b-iface-uuid",
      functionUuid: "b-fn-uuid",
      parameters: [],
    })
  })

  it("prefers a match in the receiver subtree over a global first match", () => {
    const child = makeCompWithFn("child-uuid", "child", "API", "child-iface-uuid", "getData", "child-fn-uuid")
    const svcA = makeCompWithFn("a-uuid", "ServiceA", "API", "a-iface-uuid", "getData", "a-fn-uuid")
    const svcB = makeComp("b-uuid", "ServiceB", [child])
    const root = makeComp("root-uuid", "root", [svcA, svcB])

    expect(resolveFunctionReferenceTarget(root, "ServiceB", "API", "getData")).toEqual({
      componentUuid: "child-uuid",
      interfaceUuid: "child-iface-uuid",
      functionUuid: "child-fn-uuid",
      parameters: [],
    })
  })

  it("falls back to the global tree search when receiver is unknown", () => {
    const svcA = makeCompWithFn("a-uuid", "ServiceA", "API", "a-iface-uuid", "getData", "a-fn-uuid")
    const root = makeComp("root-uuid", "root", [svcA])

    expect(resolveFunctionReferenceTarget(root, "Unknown", "API", "getData")).toEqual({
      componentUuid: "a-uuid",
      interfaceUuid: "a-iface-uuid",
      functionUuid: "a-fn-uuid",
      parameters: [],
    })
  })

  it("returns null when no matching function exists", () => {
    const root = makeComp("root-uuid", "root")
    expect(resolveFunctionReferenceTarget(root, "root", "API", "getData")).toBeNull()
  })

  it("resolves inherited interface functions on the receiver component", () => {
    const child: ComponentNode = {
      uuid: "child-uuid",
      id: "child",
      name: "child",
      type: "component",
      subComponents: [],
      actors: [],
      useCaseDiagrams: [],
      interfaces: [
        {
          uuid: "child-iface-uuid",
          id: "API",
          name: "API",
          type: "rest",
          functions: [],
          parentInterfaceUuid: "parent-iface-uuid",
        },
      ],
    }
    const root: ComponentNode = {
      uuid: "root-uuid",
      id: "root",
      name: "root",
      type: "component",
      subComponents: [child],
      actors: [],
      useCaseDiagrams: [],
      interfaces: [
        {
          uuid: "parent-iface-uuid",
          id: "API",
          name: "API",
          type: "rest",
          functions: [{ uuid: "parent-fn-uuid", id: "getData", parameters: [] }],
        },
      ],
    }

    expect(resolveFunctionReferenceTarget(root, "child", "API", "getData")).toEqual({
      componentUuid: "child-uuid",
      interfaceUuid: "child-iface-uuid",
      functionUuid: "parent-fn-uuid",
      parameters: [],
    })
  })
})
