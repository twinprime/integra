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

  it("extracts bare use case id", () => {
    const content = "use case login"
    const ids = parseDeclaredIds(content)
    expect(ids).toContain("login")
  })

  it("extracts last segment from path-style use case id", () => {
    const content = "use case auth/login"
    const ids = parseDeclaredIds(content)
    expect(ids).toContain("login")
    expect(ids).not.toContain("auth")
  })

  it("uses alias when use case has 'as' clause", () => {
    const content = "use case loginFlow as login"
    const ids = parseDeclaredIds(content)
    expect(ids).toContain("login")
    expect(ids).not.toContain("loginFlow")
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

// ─── buildSuggestions — Sequence: inherited interface functions ───────────────

describe("buildSuggestions — Sequence: inherited interface functions", () => {
  it("suggests functions from a parent interface when receiver's interface inherits", () => {
    // PaymentProcessor owns the interface with actual functions.
    // CheckoutService is a subComponent of PaymentProcessor so PaymentProcessor
    // is the parent node — matching how InheritedInterface works in ComponentEditor.
    const parentIface = {
      uuid: "iface-parent-uuid",
      id: "PaymentService",
      name: "PaymentService",
      type: "rest" as const,
      functions: [
        { uuid: "fn-pay-uuid", id: "pay", parameters: [{ uuid: "p1", name: "amount", type: "decimal", required: false }] },
        { uuid: "fn-refund-uuid", id: "refund", parameters: [{ uuid: "p2", name: "txId", type: "string", required: false }] },
      ],
    }

    // CheckoutService has an inherited interface (functions: [])
    const childIface = {
      uuid: "iface-child-uuid",
      id: "PaymentService",
      name: "PaymentService",
      type: "rest" as const,
      functions: [],
      parentInterfaceUuid: "iface-parent-uuid",
    }
    const checkout = makeComp("checkout-uuid", "CheckoutService", { interfaces: [childIface] })
    const processor = makeComp("processor-uuid", "PaymentProcessor", {
      interfaces: [parentIface],
      subComponents: [checkout],
    })

    const owner = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", { subComponents: [owner, processor] })

    const content = "actor a\ncomponent CheckoutService\na ->> CheckoutService: "
    const ctx = detectContext(content, content.length, "sequence-diagram")
    expect(ctx?.type).toBe("function-ref")

    const suggs = buildSuggestions(ctx!, content, owner, root, "sequence-diagram")
    expect(suggs.find((s) => s.insertText === "PaymentService:pay(amount: decimal?)")).toBeDefined()
    expect(suggs.find((s) => s.insertText === "PaymentService:refund(txId: string?)")).toBeDefined()
  })

  it("does not duplicate inherited functions when parent also appears as receiver", () => {
    const parentIface = {
      uuid: "iface-parent-uuid",
      id: "PaymentService",
      name: "PaymentService",
      type: "rest" as const,
      functions: [
        { uuid: "fn-pay-uuid", id: "pay", parameters: [{ uuid: "p1", name: "amount", type: "decimal", required: false }] },
      ],
    }

    const childIface = {
      uuid: "iface-child-uuid",
      id: "PaymentService",
      name: "PaymentService",
      type: "rest" as const,
      functions: [],
      parentInterfaceUuid: "iface-parent-uuid",
    }
    const checkout = makeComp("checkout-uuid", "CheckoutService", { interfaces: [childIface] })
    const processor = makeComp("processor-uuid", "PaymentProcessor", {
      interfaces: [parentIface],
      subComponents: [checkout],
    })

    const owner = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", { subComponents: [owner, processor] })

    const content = "actor a\ncomponent CheckoutService\na ->> CheckoutService: "
    const ctx = detectContext(content, content.length, "sequence-diagram")
    const suggs = buildSuggestions(ctx!, content, owner, root, "sequence-diagram")

    const paySuggs = suggs.filter((s) => s.insertText === "PaymentService:pay(amount: decimal?)")
    expect(paySuggs).toHaveLength(1)
  })
})

// ─── buildSuggestions — use case declaration (entity-name context) ───────────

describe("buildSuggestions — use case declaration", () => {
  const makeUcNode = (uuid: string, id: string, name = id) => ({
    uuid, id, name, type: "use-case" as const, sequenceDiagrams: [],
  })
  const makeUcdNode = (uuid: string, ucs: ReturnType<typeof makeUcNode>[]) => ({
    uuid, id: "ucd", name: "ucd", type: "use-case-diagram" as const,
    ownerComponentUuid: "", referencedNodeIds: [], content: "",
    useCases: ucs,
  })

  it("inserts bare id (not quoted name-as format) for a local use case", () => {
    const uc = makeUcNode("uc-uuid", "login", "Login Flow")
    const owner = makeComp("owner-uuid", "owner", { useCaseDiagrams: [makeUcdNode("ucd-uuid", [uc])] })
    const root = makeComp("root-uuid", "root", { subComponents: [owner] })

    const content = "use case "
    const ctx = detectContext(content, content.length, "use-case-diagram")
    expect(ctx?.type).toBe("entity-name")

    const suggs = buildSuggestions(ctx!, content, owner, root, "use-case-diagram")
    expect(suggs.length).toBeGreaterThan(0)
    // Insert text must be the bare id, NOT '"Login Flow" as login'
    const loginSugg = suggs.find((s) => s.insertText === "login")
    expect(loginSugg).toBeDefined()
    expect(loginSugg?.label).toBe("Login Flow")
  })

  it("does not suggest use cases from other (non-owner) components", () => {
    const uc = makeUcNode("uc-uuid", "placeOrder", "Place Order")
    const other = makeComp("other-uuid", "other", { useCaseDiagrams: [makeUcdNode("ucd-uuid", [uc])] })
    const owner = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", { subComponents: [owner, other] })

    const content = "use case "
    const ctx = detectContext(content, content.length, "use-case-diagram")
    const suggs = buildSuggestions(ctx!, content, owner, root, "use-case-diagram")
    // No suggestion for a use case that belongs to 'other', not 'owner'
    expect(suggs.find((s) => s.insertText === "placeOrder")).toBeUndefined()
  })
})

// ─── buildSuggestions — uc-link-target (arrow RHS in use case diagram) ───────

describe("buildSuggestions — uc-link-target includes local use cases", () => {
  it("suggests a use case id declared in the same diagram on the arrow RHS", () => {
    const owner = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", { subComponents: [owner] })

    // Diagram content declares a use case, then starts a link from it
    const content = "actor user\nuse case login\nuse case register\nuser ->> "
    const ctx = detectContext(content, content.length, "use-case-diagram")
    expect(ctx?.type).toBe("uc-link-target")

    const suggs = buildSuggestions(ctx!, content, owner, root, "use-case-diagram")
    expect(suggs.find((s) => s.insertText === "login")).toBeDefined()
    expect(suggs.find((s) => s.insertText === "register")).toBeDefined()
    expect(suggs.find((s) => s.insertText === "user")).toBeDefined()
  })
})
