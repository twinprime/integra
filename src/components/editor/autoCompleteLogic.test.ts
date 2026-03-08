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
