import { describe, it, expect } from "vitest"
import {
  getComponentChildren,
  getChildById,
  findCompByUuid,
  findParentInComponent,
  findIdInComponent,
  getSiblingIdsInComponent,
  findOwnerComponentUuidInComp,
  findContainerComponentByUuid,
} from "./componentTraversal"
import type { ComponentNode, ActorNode, UseCaseDiagramNode, UseCaseNode } from "../store/types"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeActor(uuid: string, id: string): ActorNode {
  return { uuid, id, name: id, type: "actor" }
}

function makeUseCase(uuid: string, id: string): UseCaseNode {
  return { uuid, id, name: id, type: "use-case", sequenceDiagrams: [] }
}

function makeUcd(uuid: string, id: string, ownerUuid: string, useCases: UseCaseNode[] = []): UseCaseDiagramNode {
  return { uuid, id, name: id, type: "use-case-diagram", content: "", referencedNodeIds: [], ownerComponentUuid: ownerUuid, useCases }
}

function makeComp(uuid: string, id: string, overrides: Partial<ComponentNode> = {}): ComponentNode {
  return {
    uuid, id, name: id, type: "component",
    subComponents: [], actors: [], useCaseDiagrams: [], interfaces: [],
    ...overrides,
  }
}

// ─── getComponentChildren ─────────────────────────────────────────────────────

describe("getComponentChildren", () => {
  it("returns subComponents, actors and useCaseDiagrams combined", () => {
    const child = makeComp("c1", "child")
    const actor = makeActor("a1", "alice")
    const ucd = makeUcd("ucd1", "UCD", "root")
    const root = makeComp("root", "root", { subComponents: [child], actors: [actor], useCaseDiagrams: [ucd] })
    const children = getComponentChildren(root)
    expect(children).toHaveLength(3)
    expect(children.map((c) => c.uuid)).toEqual(["c1", "a1", "ucd1"])
  })

  it("returns empty array when component has no children", () => {
    const root = makeComp("root", "root")
    expect(getComponentChildren(root)).toHaveLength(0)
  })
})

// ─── getChildById ─────────────────────────────────────────────────────────────

describe("getChildById", () => {
  it("finds a subComponent by id", () => {
    const child = makeComp("c1", "serviceA")
    const root = makeComp("root", "root", { subComponents: [child] })
    expect(getChildById(root, "serviceA")).toBe(child)
  })

  it("finds an actor by id", () => {
    const actor = makeActor("a1", "alice")
    const root = makeComp("root", "root", { actors: [actor] })
    expect(getChildById(root, "alice")).toBe(actor)
  })

  it("finds a use-case-diagram by id", () => {
    const ucd = makeUcd("ucd1", "MainUCD", "root")
    const root = makeComp("root", "root", { useCaseDiagrams: [ucd] })
    expect(getChildById(root, "MainUCD")).toBe(ucd)
  })

  it("returns null when id is not found", () => {
    const root = makeComp("root", "root")
    expect(getChildById(root, "missing")).toBeNull()
  })
})

// ─── findCompByUuid ───────────────────────────────────────────────────────────

describe("findCompByUuid", () => {
  it("finds the root component by its own UUID", () => {
    const root = makeComp("root-uuid", "root")
    expect(findCompByUuid(root, "root-uuid")).toBe(root)
  })

  it("finds a direct subComponent by UUID", () => {
    const child = makeComp("c1", "child")
    const root = makeComp("root", "root", { subComponents: [child] })
    expect(findCompByUuid(root, "c1")).toBe(child)
  })

  it("finds a deeply nested subComponent", () => {
    const grandchild = makeComp("gc1", "grandchild")
    const child = makeComp("c1", "child", { subComponents: [grandchild] })
    const root = makeComp("root", "root", { subComponents: [child] })
    expect(findCompByUuid(root, "gc1")).toBe(grandchild)
  })

  it("returns null when UUID is not found", () => {
    const root = makeComp("root", "root")
    expect(findCompByUuid(root, "nonexistent")).toBeNull()
  })

  it("does not match actors (not a ComponentNode)", () => {
    const root = makeComp("root", "root", { actors: [makeActor("a1", "alice")] })
    expect(findCompByUuid(root, "a1")).toBeNull()
  })
})

// ─── findParentInComponent ────────────────────────────────────────────────────

describe("findParentInComponent", () => {
  it("returns the root as parent when searching for a direct child actor", () => {
    const actor = makeActor("a1", "alice")
    const root = makeComp("root", "root", { actors: [actor] })
    expect(findParentInComponent(root, "a1")).toBe(root)
  })

  it("returns the root as parent when searching for a direct subComponent", () => {
    const child = makeComp("c1", "child")
    const root = makeComp("root", "root", { subComponents: [child] })
    expect(findParentInComponent(root, "c1")).toBe(root)
  })

  it("returns the intermediate component as parent for a deeply nested actor", () => {
    const actor = makeActor("a1", "alice")
    const child = makeComp("c1", "child", { actors: [actor] })
    const root = makeComp("root", "root", { subComponents: [child] })
    expect(findParentInComponent(root, "a1")).toBe(child)
  })

  it("returns null when UUID is not a child of any node", () => {
    const root = makeComp("root", "root")
    expect(findParentInComponent(root, "nonexistent")).toBeNull()
  })

  it("returns the UCD as parent for a use case inside it", () => {
    const uc = makeUseCase("uc1", "placeOrder")
    const ucd = makeUcd("ucd1", "MainUCD", "root", [uc])
    const root = makeComp("root", "root", { useCaseDiagrams: [ucd] })
    expect(findParentInComponent(root, "uc1")).toBe(ucd)
  })
})

// ─── findIdInComponent ────────────────────────────────────────────────────────

describe("findIdInComponent", () => {
  it("returns the id of the root component when UUID matches", () => {
    const root = makeComp("root-uuid", "myService")
    expect(findIdInComponent(root, "root-uuid")).toBe("myService")
  })

  it("returns the id of an actor by UUID", () => {
    const actor = makeActor("a1", "alice")
    const root = makeComp("root", "root", { actors: [actor] })
    expect(findIdInComponent(root, "a1")).toBe("alice")
  })

  it("returns the id of a nested subComponent by UUID", () => {
    const grandchild = makeComp("gc1", "deepService")
    const child = makeComp("c1", "child", { subComponents: [grandchild] })
    const root = makeComp("root", "root", { subComponents: [child] })
    expect(findIdInComponent(root, "gc1")).toBe("deepService")
  })

  it("returns null when UUID is not found anywhere", () => {
    const root = makeComp("root", "root")
    expect(findIdInComponent(root, "nonexistent")).toBeNull()
  })

  it("returns the id of a use-case-diagram by UUID", () => {
    const ucd = makeUcd("ucd1", "MainDiagram", "root")
    const root = makeComp("root", "root", { useCaseDiagrams: [ucd] })
    expect(findIdInComponent(root, "ucd1")).toBe("MainDiagram")
  })

  it("returns the id of a use-case by UUID", () => {
    const uc = makeUseCase("uc1", "placeOrder")
    const ucd = makeUcd("ucd1", "MainUCD", "root", [uc])
    const root = makeComp("root", "root", { useCaseDiagrams: [ucd] })
    expect(findIdInComponent(root, "uc1")).toBe("placeOrder")
  })
})

// ─── getSiblingIdsInComponent ─────────────────────────────────────────────────

describe("getSiblingIdsInComponent", () => {
  it("returns sibling ids for a subComponent", () => {
    const c1 = makeComp("c1", "service1")
    const c2 = makeComp("c2", "service2")
    const c3 = makeComp("c3", "service3")
    const root = makeComp("root", "root", { subComponents: [c1, c2, c3] })
    expect(getSiblingIdsInComponent(root, "c1")).toEqual(["service2", "service3"])
  })

  it("returns sibling ids for an actor", () => {
    const a1 = makeActor("a1", "alice")
    const a2 = makeActor("a2", "bob")
    const root = makeComp("root", "root", { actors: [a1, a2] })
    expect(getSiblingIdsInComponent(root, "a1")).toEqual(["bob"])
  })

  it("returns empty array when the node is the only sibling", () => {
    const c1 = makeComp("c1", "only")
    const root = makeComp("root", "root", { subComponents: [c1] })
    expect(getSiblingIdsInComponent(root, "c1")).toEqual([])
  })

  it("returns null when UUID is not found", () => {
    const root = makeComp("root", "root")
    expect(getSiblingIdsInComponent(root, "nonexistent")).toBeNull()
  })

  it("finds siblings for a use-case within a UCD", () => {
    const uc1 = makeUseCase("uc1", "placeOrder")
    const uc2 = makeUseCase("uc2", "cancelOrder")
    const ucd = makeUcd("ucd1", "MainUCD", "root", [uc1, uc2])
    const root = makeComp("root", "root", { useCaseDiagrams: [ucd] })
    expect(getSiblingIdsInComponent(root, "uc1")).toEqual(["cancelOrder"])
  })

  it("recurses into nested subComponents", () => {
    const gc1 = makeComp("gc1", "deep1")
    const gc2 = makeComp("gc2", "deep2")
    const child = makeComp("c1", "child", { subComponents: [gc1, gc2] })
    const root = makeComp("root", "root", { subComponents: [child] })
    expect(getSiblingIdsInComponent(root, "gc1")).toEqual(["deep2"])
  })
})

// ─── findOwnerComponentUuidInComp ─────────────────────────────────────────────

describe("findOwnerComponentUuidInComp", () => {
  it("returns the ownerComponentUuid of the UCD containing the use case", () => {
    const uc = makeUseCase("uc1", "placeOrder")
    const ucd = makeUcd("ucd1", "MainUCD", "root-uuid", [uc])
    const root = makeComp("root-uuid", "root", { useCaseDiagrams: [ucd] })
    expect(findOwnerComponentUuidInComp(root, "uc1")).toBe("root-uuid")
  })

  it("recurses into subComponents", () => {
    const uc = makeUseCase("uc1", "placeOrder")
    const ucd = makeUcd("ucd1", "MainUCD", "c1-uuid", [uc])
    const child = makeComp("c1-uuid", "child", { useCaseDiagrams: [ucd] })
    const root = makeComp("root", "root", { subComponents: [child] })
    expect(findOwnerComponentUuidInComp(root, "uc1")).toBe("c1-uuid")
  })

  it("returns null when use case UUID is not found", () => {
    const root = makeComp("root", "root")
    expect(findOwnerComponentUuidInComp(root, "nonexistent")).toBeNull()
  })
})

// ─── findContainerComponentByUuid ────────────────────────────────────────────

describe("findContainerComponentByUuid", () => {
  it("finds root itself", () => {
    const root = makeComp("root-uuid", "root")
    expect(findContainerComponentByUuid(root, "root-uuid")).toBe(root)
  })

  it("finds a direct child component", () => {
    const child = makeComp("c1", "child")
    const root = makeComp("root", "root", { subComponents: [child] })
    expect(findContainerComponentByUuid(root, "c1")).toBe(child)
  })

  it("finds a deeply nested component", () => {
    const grandchild = makeComp("gc1", "grandchild")
    const child = makeComp("c1", "child", { subComponents: [grandchild] })
    const root = makeComp("root", "root", { subComponents: [child] })
    expect(findContainerComponentByUuid(root, "gc1")).toBe(grandchild)
  })

  it("returns null when UUID is not found", () => {
    const root = makeComp("root", "root")
    expect(findContainerComponentByUuid(root, "nonexistent")).toBeNull()
  })
})
