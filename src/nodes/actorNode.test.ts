import { describe, it, expect } from "vitest"
import { applyIdRenameInActor } from "./actorNode"
import type { ActorNode } from "../store/types"

function makeActor(overrides: Partial<ActorNode> = {}): ActorNode {
  return { uuid: "a1", id: "alice", name: "Alice", type: "actor", ...overrides }
}

// ─── applyIdRenameInActor ─────────────────────────────────────────────────────

describe("applyIdRenameInActor", () => {
  it("renames the actor id when its UUID matches the target", () => {
    const actor = makeActor()
    const result = applyIdRenameInActor(actor, "a1", "alice", "newAlice")
    expect(result.id).toBe("newAlice")
  })

  it("does not rename the actor id when UUID does not match", () => {
    const actor = makeActor()
    const result = applyIdRenameInActor(actor, "other-uuid", "alice", "newAlice")
    expect(result.id).toBe("alice")
  })

  it("updates description references when oldId appears as a markdown link path segment", () => {
    const actor = makeActor({ description: "See [alice profile](alice) for details" })
    const result = applyIdRenameInActor(actor, "other-uuid", "alice", "newAlice")
    expect(result.description).toContain("(newAlice)")
  })

  it("does not touch description when it does not contain the oldId", () => {
    const actor = makeActor({ description: "A generic actor" })
    const result = applyIdRenameInActor(actor, "other-uuid", "alice", "newAlice")
    expect(result.description).toBe("A generic actor")
  })

  it("leaves description undefined when not set", () => {
    const actor = makeActor()
    const result = applyIdRenameInActor(actor, "a1", "alice", "newAlice")
    expect(result.description).toBeUndefined()
  })

  it("preserves all other fields unchanged", () => {
    const actor = makeActor({ name: "Alice Smith" })
    const result = applyIdRenameInActor(actor, "a1", "alice", "newAlice")
    expect(result.name).toBe("Alice Smith")
    expect(result.type).toBe("actor")
    expect(result.uuid).toBe("a1")
  })

  it("returns a new object (immutable)", () => {
    const actor = makeActor()
    const result = applyIdRenameInActor(actor, "a1", "alice", "newAlice")
    expect(result).not.toBe(actor)
  })
})
