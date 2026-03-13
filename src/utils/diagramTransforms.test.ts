/**
 * Tests for src/utils/diagramTransforms.ts
 *
 * Covers:
 *   - RX_PART_NAMED  — regex for named participant declarations
 *   - RX_PART_BARE   — regex for bare participant declarations
 *   - buildIdToUuidMap — builds alias → uuid map from diagram content
 */
import { describe, it, expect } from "vitest"
import { RX_PART_NAMED, RX_PART_BARE, buildIdToUuidMap } from "./diagramTransforms"
import type { ComponentNode, ActorNode } from "../store/types"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeActor(uuid: string, id: string): ActorNode {
  return { uuid, id, name: id, type: "actor", description: "" }
}

function makeComp(
  uuid: string,
  id: string,
  subComponents: ComponentNode[] = [],
  actors: ActorNode[] = [],
): ComponentNode {
  return {
    uuid,
    id,
    name: id,
    type: "component",
    actors,
    subComponents,
    useCaseDiagrams: [],
    interfaces: [],
  }
}

// ─── RX_PART_NAMED ────────────────────────────────────────────────────────────

describe("RX_PART_NAMED", () => {
  it("matches an actor named participant", () => {
    const m = RX_PART_NAMED.exec(`actor "Alice" as alice`)
    expect(m).not.toBeNull()
    expect(m![2]).toBe("actor")
    expect(m![7]).toBe("alice")
  })

  it("matches a component named participant", () => {
    const m = RX_PART_NAMED.exec(`component "Auth Service" as auth`)
    expect(m).not.toBeNull()
    expect(m![2]).toBe("component")
    expect(m![7]).toBe("auth")
  })

  it("matches a use case named participant", () => {
    const m = RX_PART_NAMED.exec(`use case "Login" as login`)
    expect(m).not.toBeNull()
    expect(m![2]).toBe("use case")
    expect(m![7]).toBe("login")
  })

  it("captures the from-path when present", () => {
    const m = RX_PART_NAMED.exec(`actor "Alice" from owner/actors as alice`)
    expect(m).not.toBeNull()
    expect(m![5]).toBe("owner/actors")
    expect(m![7]).toBe("alice")
  })

  it("does NOT match a bare participant declaration", () => {
    expect(RX_PART_NAMED.exec("actor alice")).toBeNull()
  })

  it("does NOT match a line without the as keyword", () => {
    expect(RX_PART_NAMED.exec(`actor "Alice"`)).toBeNull()
  })
})

// ─── RX_PART_BARE ─────────────────────────────────────────────────────────────

describe("RX_PART_BARE", () => {
  it("matches a bare actor declaration", () => {
    const m = RX_PART_BARE.exec("actor alice")
    expect(m).not.toBeNull()
    expect(m![2]).toBe("actor")
    expect(m![4]).toBe("alice")
  })

  it("matches a bare component declaration", () => {
    const m = RX_PART_BARE.exec("component auth")
    expect(m).not.toBeNull()
    expect(m![2]).toBe("component")
    expect(m![4]).toBe("auth")
  })

  it("does NOT match a use case bare declaration", () => {
    expect(RX_PART_BARE.exec("use case login")).toBeNull()
  })

  it("does NOT match a named participant (with quotes)", () => {
    expect(RX_PART_BARE.exec(`actor "Alice" as alice`)).toBeNull()
  })

  it("matches with leading whitespace", () => {
    const m = RX_PART_BARE.exec("  actor alice")
    expect(m).not.toBeNull()
    expect(m![4]).toBe("alice")
  })
})

// ─── buildIdToUuidMap ─────────────────────────────────────────────────────────

describe("buildIdToUuidMap — null ownerComp", () => {
  it("returns empty map and orderedUuids when ownerComp is null", () => {
    const root = makeComp("root-uuid", "root")
    const result = buildIdToUuidMap("actor alice", "sequence-diagram", null, root)
    expect(result.map).toEqual({})
    expect(result.orderedUuids).toEqual([])
  })
})

describe("buildIdToUuidMap — empty content", () => {
  it("returns empty map for empty string", () => {
    const owner = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [owner])
    const result = buildIdToUuidMap("", "sequence-diagram", owner, root)
    expect(result.map).toEqual({})
    expect(result.orderedUuids).toEqual([])
  })

  it("returns empty map for content with only blank lines", () => {
    const owner = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [owner])
    const result = buildIdToUuidMap("\n\n\n", "sequence-diagram", owner, root)
    expect(result.map).toEqual({})
    expect(result.orderedUuids).toEqual([])
  })
})

describe("buildIdToUuidMap — sequence-diagram bare declarations", () => {
  it("resolves a bare actor declared inside the owner component", () => {
    const actor = makeActor("alice-uuid", "alice")
    const owner = makeComp("owner-uuid", "owner", [], [actor])
    const root = makeComp("root-uuid", "root", [owner])
    const result = buildIdToUuidMap("actor alice", "sequence-diagram", owner, root)
    expect(result.map).toEqual({ alice: "alice-uuid" })
    expect(result.orderedUuids).toEqual(["alice-uuid"])
  })

  it("resolves a bare component sub-component of the owner", () => {
    const child = makeComp("child-uuid", "child")
    const owner = makeComp("owner-uuid", "owner", [child])
    const root = makeComp("root-uuid", "root", [owner])
    const result = buildIdToUuidMap("component child", "sequence-diagram", owner, root)
    expect(result.map).toEqual({ child: "child-uuid" })
    expect(result.orderedUuids).toEqual(["child-uuid"])
  })

  it("skips a bare participant that cannot be resolved in owner", () => {
    const owner = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [owner])
    const result = buildIdToUuidMap("actor unknown", "sequence-diagram", owner, root)
    expect(result.map).toEqual({})
    expect(result.orderedUuids).toEqual([])
  })

  it("builds map for multiple bare participants", () => {
    const alice = makeActor("alice-uuid", "alice")
    const bob = makeActor("bob-uuid", "bob")
    const owner = makeComp("owner-uuid", "owner", [], [alice, bob])
    const root = makeComp("root-uuid", "root", [owner])
    const content = "actor alice\nactor bob"
    const result = buildIdToUuidMap(content, "sequence-diagram", owner, root)
    expect(result.map).toEqual({ alice: "alice-uuid", bob: "bob-uuid" })
    expect(result.orderedUuids).toEqual(["alice-uuid", "bob-uuid"])
  })
})

describe("buildIdToUuidMap — use-case-diagram skips bare declarations", () => {
  it("does NOT resolve bare participants in use-case-diagram mode", () => {
    const actor = makeActor("alice-uuid", "alice")
    const owner = makeComp("owner-uuid", "owner", [], [actor])
    const root = makeComp("root-uuid", "root", [owner])
    const result = buildIdToUuidMap("actor alice", "use-case-diagram", owner, root)
    expect(result.map).toEqual({})
    expect(result.orderedUuids).toEqual([])
  })
})

describe("buildIdToUuidMap — named participant declarations", () => {
  it("resolves a named actor participant (no from-path)", () => {
    const actor = makeActor("alice-uuid", "alice")
    const owner = makeComp("owner-uuid", "owner", [], [actor])
    const root = makeComp("root-uuid", "root", [owner])
    const content = `actor "Alice Smith" as alice`
    const result = buildIdToUuidMap(content, "sequence-diagram", owner, root)
    expect(result.map).toEqual({ alice: "alice-uuid" })
    expect(result.orderedUuids).toEqual(["alice-uuid"])
  })

  it("resolves a named participant via from-path referencing root", () => {
    const actor = makeActor("actor-uuid", "alice")
    const owner = makeComp("owner-uuid", "owner", [], [actor])
    const root = makeComp("root-uuid", "root", [owner])
    // from-path "root/owner" → resolves to owner uuid via findNodeByPath
    const content = `actor "Alice" from root/owner as a`
    const result = buildIdToUuidMap(content, "use-case-diagram", owner, root)
    // findNodeByPath("root/owner") resolves to owner component uuid
    expect(result.map).toEqual({ a: "owner-uuid" })
    expect(result.orderedUuids).toEqual(["owner-uuid"])
  })

  it("skips a named participant with unresolvable from-path", () => {
    const owner = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [owner])
    const content = `actor "Ghost" from nonexistent/path as ghost`
    const result = buildIdToUuidMap(content, "use-case-diagram", owner, root)
    expect(result.map).toEqual({})
    expect(result.orderedUuids).toEqual([])
  })

  it("resolves named participants in use-case-diagram mode (named are always processed)", () => {
    const actor = makeActor("alice-uuid", "alice")
    const owner = makeComp("owner-uuid", "owner", [], [actor])
    const root = makeComp("root-uuid", "root", [owner])
    const content = `actor "Alice" as alice`
    const result = buildIdToUuidMap(content, "use-case-diagram", owner, root)
    expect(result.map).toEqual({ alice: "alice-uuid" })
    expect(result.orderedUuids).toEqual(["alice-uuid"])
  })
})

describe("buildIdToUuidMap — mixed content", () => {
  it("ignores non-participant lines in sequence-diagram content", () => {
    const actor = makeActor("alice-uuid", "alice")
    const owner = makeComp("owner-uuid", "owner", [], [actor])
    const root = makeComp("root-uuid", "root", [owner])
    const content = "actor alice\nalice ->> bob: hello\nnote over alice: hi"
    const result = buildIdToUuidMap(content, "sequence-diagram", owner, root)
    expect(result.map).toEqual({ alice: "alice-uuid" })
    expect(result.orderedUuids).toEqual(["alice-uuid"])
  })

  it("preserves declaration order in orderedUuids", () => {
    const a1 = makeActor("uuid-1", "p1")
    const a2 = makeActor("uuid-2", "p2")
    const a3 = makeActor("uuid-3", "p3")
    const owner = makeComp("owner-uuid", "owner", [], [a1, a2, a3])
    const root = makeComp("root-uuid", "root", [owner])
    const content = "actor p1\nactor p2\nactor p3"
    const result = buildIdToUuidMap(content, "sequence-diagram", owner, root)
    expect(result.orderedUuids).toEqual(["uuid-1", "uuid-2", "uuid-3"])
  })
})
