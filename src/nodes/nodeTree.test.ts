import { describe, it, expect } from "vitest"
import { mergeLists, deleteNodeFromTree } from "./nodeTree"
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
