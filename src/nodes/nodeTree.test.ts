import { describe, it, expect } from "vitest"
import { mergeLists, deleteNodeFromTree, reorderChildInParent } from "./nodeTree"
import type { ComponentNode } from "../store/types"

// ─── mergeLists ───────────────────────────────────────────────────────────────

describe("mergeLists — name preservation", () => {
  it("preserves existing custom name when incoming name equals id (no alias)", () => {
    const existing = [{ id: "alice", name: "Alice Smith" }]
    const incoming = [{ id: "alice", name: "alice" }] // parser default: name === id
    const result = mergeLists(existing, incoming)
    expect(result[0].name).toBe("Alice Smith")
  })

  it("updates name when incoming has an explicit alias (name differs from id)", () => {
    const existing = [{ id: "alice", name: "Alice Smith" }]
    const incoming = [{ id: "alice", name: "Lead" }] // explicit alias
    const result = mergeLists(existing, incoming)
    expect(result[0].name).toBe("Lead")
  })

  it("adds new node with incoming name when id not yet in list", () => {
    const existing: { id: string; name: string }[] = []
    const incoming = [{ id: "bob", name: "bob" }]
    const result = mergeLists(existing, incoming)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("bob")
  })

  it("does not modify existing entries not present in incoming", () => {
    const existing = [{ id: "alice", name: "Alice Smith" }, { id: "bob", name: "Bob" }]
    const incoming = [{ id: "alice", name: "alice" }]
    const result = mergeLists(existing, incoming)
    expect(result).toHaveLength(2)
    expect(result[1].name).toBe("Bob")
  })

  it("preserves uuid and other fields when name is not updated", () => {
    const existing = [{ id: "alice", name: "Alice Smith", uuid: "uuid-1", type: "actor" as const }]
    const incoming = [{ id: "alice", name: "alice", uuid: "uuid-new", type: "actor" as const }]
    const result = mergeLists(existing, incoming)
    expect(result[0].uuid).toBe("uuid-1")
    expect(result[0].name).toBe("Alice Smith")
  })
})

// ─── deleteNodeFromTree — use case deletion ───────────────────────────────────

describe("deleteNodeFromTree — use case deletion", () => {
  function makeTree(): ComponentNode {
    const uc = {
      uuid: "uc-uuid", id: "placeOrder", name: "Place Order",
      type: "use-case" as const, sequenceDiagrams: [],
    }
    const ucd = {
      uuid: "ucd-uuid", id: "MainUCD", name: "Main UCD",
      type: "use-case-diagram" as const,
      ownerComponentUuid: "root-uuid", referencedNodeIds: [], content: "",
      useCases: [uc],
    }
    return {
      uuid: "root-uuid", id: "root", name: "root", type: "component",
      actors: [], subComponents: [], interfaces: [], useCaseDiagrams: [ucd],
    }
  }

  it("removes a use case from its parent UCD when deleted by UUID", () => {
    const root = makeTree()
    const updated = deleteNodeFromTree(root, "uc-uuid") as ComponentNode
    expect(updated.useCaseDiagrams[0].useCases).toHaveLength(0)
  })

  it("does not affect other use cases when deleting one", () => {
    const root = makeTree()
    // Add a second use case
    root.useCaseDiagrams[0].useCases.push({
      uuid: "uc2-uuid", id: "viewOrder", name: "View Order",
      type: "use-case", sequenceDiagrams: [],
    })
    const updated = deleteNodeFromTree(root, "uc-uuid") as ComponentNode
    expect(updated.useCaseDiagrams[0].useCases).toHaveLength(1)
    expect(updated.useCaseDiagrams[0].useCases[0].uuid).toBe("uc2-uuid")
  })

  it("removes a use case nested in a sub-component UCD", () => {
    const uc = {
      uuid: "uc-uuid", id: "placeOrder", name: "Place Order",
      type: "use-case" as const, sequenceDiagrams: [],
    }
    const ucd = {
      uuid: "ucd-uuid", id: "MainUCD", name: "Main UCD",
      type: "use-case-diagram" as const,
      ownerComponentUuid: "child-uuid", referencedNodeIds: [], content: "",
      useCases: [uc],
    }
    const child: ComponentNode = {
      uuid: "child-uuid", id: "child", name: "child", type: "component",
      actors: [], subComponents: [], interfaces: [], useCaseDiagrams: [ucd],
    }
    const root: ComponentNode = {
      uuid: "root-uuid", id: "root", name: "root", type: "component",
      actors: [], subComponents: [child], interfaces: [], useCaseDiagrams: [],
    }
    const updated = deleteNodeFromTree(root, "uc-uuid") as ComponentNode
    expect(updated.subComponents[0].useCaseDiagrams[0].useCases).toHaveLength(0)
  })
})

// ─── reorderChildInParent ─────────────────────────────────────────────────────

describe("reorderChildInParent", () => {
  function makeRoot(): ComponentNode {
    return {
      uuid: "root", id: "root", name: "Root", type: "component",
      interfaces: [],
      subComponents: [
        { uuid: "c1", id: "c1", name: "C1", type: "component", subComponents: [], actors: [], useCaseDiagrams: [], interfaces: [] },
        { uuid: "c2", id: "c2", name: "C2", type: "component", subComponents: [], actors: [], useCaseDiagrams: [], interfaces: [] },
        { uuid: "c3", id: "c3", name: "C3", type: "component", subComponents: [], actors: [], useCaseDiagrams: [], interfaces: [] },
      ],
      actors: [
        { uuid: "a1", id: "a1", name: "A1", type: "actor" },
        { uuid: "a2", id: "a2", name: "A2", type: "actor" },
      ],
      useCaseDiagrams: [],
    }
  }

  it("reorders subComponents within the same parent", () => {
    const root = makeRoot()
    const result = reorderChildInParent(root, "root", "c1", "c3")
    expect(result.subComponents.map((n) => n.uuid)).toEqual(["c2", "c3", "c1"])
  })

  it("reorders actors within the same parent", () => {
    const root = makeRoot()
    const result = reorderChildInParent(root, "root", "a2", "a1")
    expect(result.actors.map((n) => n.uuid)).toEqual(["a2", "a1"])
  })

  it("does not move a node across typed arrays (actor over subComponent)", () => {
    const root = makeRoot()
    const result = reorderChildInParent(root, "root", "a1", "c1")
    expect(result.actors.map((n) => n.uuid)).toEqual(["a1", "a2"])
    expect(result.subComponents.map((n) => n.uuid)).toEqual(["c1", "c2", "c3"])
  })

  it("reorders use cases within a use-case-diagram", () => {
    const uc1 = { uuid: "uc1", id: "uc1", name: "UC1", type: "use-case" as const, sequenceDiagrams: [] }
    const uc2 = { uuid: "uc2", id: "uc2", name: "UC2", type: "use-case" as const, sequenceDiagrams: [] }
    const ucd = {
      uuid: "ucd1", id: "ucd1", name: "UCD1", type: "use-case-diagram" as const,
      ownerComponentUuid: "root", referencedNodeIds: [], content: "",
      useCases: [uc1, uc2],
    }
    const root: ComponentNode = {
      uuid: "root", id: "root", name: "Root", type: "component",
      interfaces: [], subComponents: [], actors: [], useCaseDiagrams: [ucd],
    }
    const result = reorderChildInParent(root, "ucd1", "uc2", "uc1")
    expect(result.useCaseDiagrams[0].useCases.map((n) => n.uuid)).toEqual(["uc2", "uc1"])
  })

  it("reorders sequence diagrams within a use-case", () => {
    const sd1 = { uuid: "sd1", id: "sd1", name: "SD1", type: "sequence-diagram" as const, content: "", ownerComponentUuid: "root", referencedNodeIds: [], referencedFunctionUuids: [] }
    const sd2 = { uuid: "sd2", id: "sd2", name: "SD2", type: "sequence-diagram" as const, content: "", ownerComponentUuid: "root", referencedNodeIds: [], referencedFunctionUuids: [] }
    const uc = { uuid: "uc1", id: "uc1", name: "UC1", type: "use-case" as const, sequenceDiagrams: [sd1, sd2] }
    const ucd = {
      uuid: "ucd1", id: "ucd1", name: "UCD1", type: "use-case-diagram" as const,
      ownerComponentUuid: "root", referencedNodeIds: [], content: "",
      useCases: [uc],
    }
    const root: ComponentNode = {
      uuid: "root", id: "root", name: "Root", type: "component",
      interfaces: [], subComponents: [], actors: [], useCaseDiagrams: [ucd],
    }
    const result = reorderChildInParent(root, "uc1", "sd2", "sd1")
    expect(result.useCaseDiagrams[0].useCases[0].sequenceDiagrams.map((n) => n.uuid)).toEqual(["sd2", "sd1"])
  })

  it("returns tree unchanged when active and over are the same node", () => {
    const root = makeRoot()
    const result = reorderChildInParent(root, "root", "c1", "c1")
    expect(result.subComponents.map((n) => n.uuid)).toEqual(["c1", "c2", "c3"])
  })
})
