import { describe, it, expect } from "vitest"
import {
  parseDeclaredIds,
  detectContext,
  collectAllComponents,
  findComponentByIdInTree,
  buildSuggestions,
} from "./autoCompleteLogic"
import type { ComponentNode } from "../../store/types"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeComp(uuid: string, id: string, overrides: Partial<ComponentNode> = {}): ComponentNode {
  return {
    uuid, id, name: id, type: "component",
    subComponents: [], actors: [], useCaseDiagrams: [], interfaces: [], ...overrides,
  }
}

// ─── parseDeclaredIds ─────────────────────────────────────────────────────────

describe("parseDeclaredIds", () => {
  it("extracts aliased ids", () => {
    const content = "component MyComp as comp1\nactor sys as actor1"
    const ids = parseDeclaredIds(content)
    expect(ids).toContain("comp1")
    expect(ids).toContain("actor1")
  })

  it("extracts bare ids (no alias)", () => {
    const content = "component serviceA\nactor userX"
    const ids = parseDeclaredIds(content)
    expect(ids).toContain("serviceA")
    expect(ids).toContain("userX")
  })

  it("returns empty array for empty content", () => {
    expect(parseDeclaredIds("")).toEqual([])
  })

  it("does not duplicate ids when both bare and aliased patterns match", () => {
    const content = "component foo as bar"
    const ids = parseDeclaredIds(content)
    // Only alias "bar" should be captured, not "foo"
    expect(ids).toContain("bar")
    expect(ids).not.toContain("foo")
  })

  it("handles path-style bare ids by extracting last segment", () => {
    const content = "component parent/child"
    const ids = parseDeclaredIds(content)
    expect(ids).toContain("child")
  })
})

// ─── detectContext ────────────────────────────────────────────────────────────

describe("detectContext", () => {
  it("returns keyword context at start of line with partial match", () => {
    const content = "com"
    const ctx = detectContext(content, content.length, "sequence-diagram")
    expect(ctx?.type).toBe("keyword")
  })

  it("returns null when line starts with a quoted string (unrecognised context)", () => {
    const content = '"partial string'
    const ctx = detectContext(content, content.length, "sequence-diagram")
    expect(ctx).toBeNull()
  })

  it("returns entity-name context after 'actor '", () => {
    const content = "actor "
    const ctx = detectContext(content, content.length, "sequence-diagram")
    expect(ctx?.type).toBe("entity-name")
  })

  it("returns seq-receiver context after arrow with no colon", () => {
    const content = "A ->> "
    const ctx = detectContext(content, content.length, "sequence-diagram")
    expect(ctx?.type).toBe("seq-receiver")
  })

  it("returns function-ref context after arrow + receiver + colon", () => {
    const content = "A ->> B: "
    const ctx = detectContext(content, content.length, "sequence-diagram")
    expect(ctx?.type).toBe("function-ref")
    if (ctx?.type === "function-ref") {
      expect(ctx.receiverId).toBe("B")
    }
  })

  it("returns keyword context for 'use' in use-case diagram", () => {
    const content = "use"
    const ctx = detectContext(content, content.length, "use-case-diagram")
    expect(ctx?.type).toBe("keyword")
    if (ctx?.type === "keyword") {
      expect(ctx.keywords).toContain("use case")
    }
  })
})

// ─── collectAllComponents ─────────────────────────────────────────────────────

describe("collectAllComponents", () => {
  it("returns root alone when there are no sub-components", () => {
    const root = makeComp("r", "root")
    expect(collectAllComponents(root)).toHaveLength(1)
    expect(collectAllComponents(root)[0]).toBe(root)
  })

  it("recursively collects nested sub-components", () => {
    const grandchild = makeComp("gc", "gc")
    const child = makeComp("c", "child", { subComponents: [grandchild] })
    const root = makeComp("r", "root", { subComponents: [child] })
    const all = collectAllComponents(root)
    expect(all).toHaveLength(3)
    expect(all.map((c) => c.id)).toEqual(expect.arrayContaining(["root", "child", "gc"]))
  })
})

// ─── findComponentByIdInTree ──────────────────────────────────────────────────

describe("findComponentByIdInTree", () => {
  it("finds root by id", () => {
    const root = makeComp("r", "root")
    expect(findComponentByIdInTree(root, "root")).toBe(root)
  })

  it("finds a nested component", () => {
    const child = makeComp("c", "child")
    const root = makeComp("r", "root", { subComponents: [child] })
    expect(findComponentByIdInTree(root, "child")).toBe(child)
  })

  it("returns null when id is not found", () => {
    const root = makeComp("r", "root")
    expect(findComponentByIdInTree(root, "missing")).toBeNull()
  })
})

// ─── buildSuggestions (keyword context) ───────────────────────────────────────

describe("buildSuggestions", () => {
  it("returns keyword suggestions with trailing space (except 'end')", () => {
    const content = "act"
    const ctx = detectContext(content, content.length, "sequence-diagram")!
    expect(ctx.type).toBe("keyword")
    const root = makeComp("r", "root")
    const suggs = buildSuggestions(ctx, content, root, root, "sequence-diagram")
    const actorSugg = suggs.find((s) => s.label === "actor")
    expect(actorSugg?.insertText).toBe("actor ")
  })

  it("returns 'end' suggestion without trailing space", () => {
    const content = "en"
    const ctx = detectContext(content, content.length, "sequence-diagram")!
    expect(ctx.type).toBe("keyword")
    const root = makeComp("r", "root")
    const suggs = buildSuggestions(ctx, content, root, root, "sequence-diagram")
    const endSugg = suggs.find((s) => s.label === "end")
    expect(endSugg?.insertText).toBe("end")
  })
})

// ─── buildSuggestions — Sequence: autocomplete ───────────────────────────────

describe("buildSuggestions — Sequence: suggestions", () => {
  const makeSeq = (uuid: string, id: string, name = id) => ({
    uuid, id, name, type: "sequence-diagram" as const,
    ownerComponentUuid: "", referencedNodeIds: [], referencedFunctionUuids: [], content: "",
  })
  const makeUc = (uuid: string, id: string, seqs: ReturnType<typeof makeSeq>[]) => ({
    uuid, id, name: id, type: "use-case" as const,
    sequenceDiagrams: seqs,
  })
  const makeUcd = (uuid: string, ucs: ReturnType<typeof makeUc>[]) => ({
    uuid, id: "ucd", name: "ucd", type: "use-case-diagram" as const,
    ownerComponentUuid: "", referencedNodeIds: [], content: "",
    useCases: ucs,
  })

  it("suggests Sequence: for local sequence diagrams", () => {
    const seq = makeSeq("seq-uuid", "loginFlow", "Login Flow")
    const uc = makeUc("uc-uuid", "login", [seq])
    const owner = makeComp("owner-uuid", "owner", { useCaseDiagrams: [makeUcd("ucd-uuid", [uc])] })
    const root = makeComp("root-uuid", "root", { subComponents: [owner] })

    const content = "actor a\ncomponent owner\na ->> owner: "
    const ctx = detectContext(content, content.length, "sequence-diagram")
    expect(ctx?.type).toBe("function-ref")

    const suggs = buildSuggestions(ctx!, content, owner, root, "sequence-diagram")
    const seqSugg = suggs.find((s) => s.insertText === "Sequence:loginFlow")
    expect(seqSugg).toBeDefined()
    expect(seqSugg?.label).toBe("Sequence:loginFlow (Login Flow)")
  })

  it("suggests Sequence: with absolute path for remote component's sequence diagrams", () => {
    const seq = makeSeq("seq-uuid", "loginFlow", "Login Flow")
    const uc = makeUc("uc-uuid", "login", [seq])
    const auth = makeComp("auth-uuid", "auth", { useCaseDiagrams: [makeUcd("ucd-uuid", [uc])] })
    const owner = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", { subComponents: [owner, auth] })

    const content = "actor a\ncomponent auth\na ->> auth: "
    const ctx = detectContext(content, content.length, "sequence-diagram")
    expect(ctx?.type).toBe("function-ref")

    const suggs = buildSuggestions(ctx!, content, owner, root, "sequence-diagram")
    // Absolute path includes root component id prefix (same convention as UseCase: refs)
    const seqSugg = suggs.find((s) => s.insertText.startsWith("Sequence:") && s.insertText.endsWith("auth/loginFlow"))
    expect(seqSugg).toBeDefined()
  })

  it("suggests UseCase: and Sequence: even when receiver has no use cases (tree-wide search)", () => {
    // The receiver (AuthService) has NO use cases, but another component (OrderService) does.
    // UseCase: and Sequence: refs are navigation links — they should come from the full tree.
    const seq = makeSeq("seq-uuid", "placeOrderFlow", "Place Order Flow")
    const uc = makeUc("uc-uuid", "placeOrder", [seq])
    const order = makeComp("order-uuid", "OrderService", { useCaseDiagrams: [makeUcd("ucd-uuid", [uc])] })
    const auth = makeComp("auth-uuid", "AuthService")
    const owner = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", { subComponents: [owner, auth, order] })

    // Arrow points at AuthService (no use cases) — empty partial so all refs are candidates
    const content = "actor a\ncomponent AuthService\na ->> AuthService: "
    const ctx = detectContext(content, content.length, "sequence-diagram")
    expect(ctx?.type).toBe("function-ref")

    const suggs = buildSuggestions(ctx!, content, owner, root, "sequence-diagram")
    const ucSugg = suggs.find((s) => s.insertText.includes("UseCase:") && s.insertText.includes("placeOrder"))
    expect(ucSugg).toBeDefined()
    const seqSugg = suggs.find((s) => s.insertText.includes("Sequence:") && s.insertText.includes("placeOrderFlow"))
    expect(seqSugg).toBeDefined()
  })

  it("suggests UseCase: from another component when typing UseCase: prefix", () => {
    // Receiver has no use cases but another component does — UseCase: partial should match.
    const uc = makeUc("uc-uuid", "placeOrder", [])
    const order = makeComp("order-uuid", "OrderService", { useCaseDiagrams: [makeUcd("ucd-uuid", [uc])] })
    const owner = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", { subComponents: [owner, order] })

    const content = "actor a\ncomponent OrderService\na ->> OrderService: UseCase:"
    const ctx = detectContext(content, content.length, "sequence-diagram")
    expect(ctx?.type).toBe("function-ref")

    const suggs = buildSuggestions(ctx!, content, owner, root, "sequence-diagram")
    expect(suggs.find((s) => s.insertText.includes("UseCase:") && s.insertText.includes("placeOrder"))).toBeDefined()
  })

  it("filters Sequence: suggestions by partial match", () => {
    const seq1 = makeSeq("seq1-uuid", "loginFlow", "Login Flow")
    const seq2 = makeSeq("seq2-uuid", "logoutFlow", "Logout Flow")
    const uc = makeUc("uc-uuid", "auth", [seq1, seq2])
    const owner = makeComp("owner-uuid", "owner", { useCaseDiagrams: [makeUcd("ucd-uuid", [uc])] })
    const root = makeComp("root-uuid", "root", { subComponents: [owner] })

    const content = "actor a\ncomponent owner\na ->> owner: Sequence:login"
    const ctx = detectContext(content, content.length, "sequence-diagram")
    expect(ctx?.type).toBe("function-ref")

    const suggs = buildSuggestions(ctx!, content, owner, root, "sequence-diagram")
    expect(suggs.find((s) => s.insertText === "Sequence:loginFlow")).toBeDefined()
    expect(suggs.find((s) => s.insertText === "Sequence:logoutFlow")).toBeUndefined()
  })
})
