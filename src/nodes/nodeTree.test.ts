import { describe, it, expect } from "vitest"
import { mergeLists } from "./nodeTree"

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
