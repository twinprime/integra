import { describe, it, expect } from "vitest"
import { applyIdRenameInSeqDiag, replaceSignatureInContent } from "./sequenceDiagramNode"
import type { SequenceDiagramNode, Parameter } from "../store/types"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSeqDiag(overrides: Partial<SequenceDiagramNode> = {}): SequenceDiagramNode {
  return {
    uuid: "sd1", id: "mainFlow", name: "Main Flow", type: "sequence-diagram",
    content: "", referencedNodeIds: [], ownerComponentUuid: "comp-uuid",
    referencedFunctionUuids: [],
    ...overrides,
  }
}

// ─── applyIdRenameInSeqDiag ───────────────────────────────────────────────────

describe("applyIdRenameInSeqDiag", () => {
  it("renames the sequence diagram id when its UUID matches the target", () => {
    const sd = makeSeqDiag()
    const result = applyIdRenameInSeqDiag(sd, "sd1", "mainFlow", "happyPath")
    expect(result.id).toBe("happyPath")
  })

  it("does not rename the id when UUID does not match", () => {
    const sd = makeSeqDiag()
    const result = applyIdRenameInSeqDiag(sd, "other-uuid", "mainFlow", "happyPath")
    expect(result.id).toBe("mainFlow")
  })

  it("updates description references when oldId appears as a markdown link path segment", () => {
    const sd = makeSeqDiag({ description: "See [flow](mainFlow) for details" })
    const result = applyIdRenameInSeqDiag(sd, "other-uuid", "mainFlow", "happyPath")
    expect(result.description).toContain("(happyPath)")
  })

  it("leaves description undefined when not set", () => {
    const sd = makeSeqDiag()
    const result = applyIdRenameInSeqDiag(sd, "sd1", "mainFlow", "happyPath")
    expect(result.description).toBeUndefined()
  })

  it("preserves all other fields unchanged", () => {
    const sd = makeSeqDiag({ referencedNodeIds: ["node1"], referencedFunctionUuids: ["fn1"] })
    const result = applyIdRenameInSeqDiag(sd, "sd1", "mainFlow", "happyPath")
    expect(result.uuid).toBe("sd1")
    expect(result.ownerComponentUuid).toBe("comp-uuid")
    expect(result.referencedNodeIds).toEqual(["node1"])
    expect(result.referencedFunctionUuids).toEqual(["fn1"])
  })

  it("returns a new object (immutable)", () => {
    const sd = makeSeqDiag()
    const result = applyIdRenameInSeqDiag(sd, "sd1", "mainFlow", "happyPath")
    expect(result).not.toBe(sd)
  })
})

// ─── replaceSignatureInContent ────────────────────────────────────────────────

const PARAMS_NONE: Parameter[] = []
const PARAMS_ONE: Parameter[] = [{ name: "id", type: "number", required: true }]
const PARAMS_TWO: Parameter[] = [
  { name: "id", type: "number", required: true },
  { name: "name", type: "string", required: false },
]
const PARAMS_MULTI: Parameter[] = [
  { name: "userId", type: "string", required: true },
  { name: "limit", type: "number", required: false },
  { name: "offset", type: "number", required: false },
]

describe("replaceSignatureInContent", () => {
  it("replaces a zero-param signature with new params", () => {
    const content = "OrderService:placeOrder() is called"
    const result = replaceSignatureInContent(content, "OrderService", "placeOrder", PARAMS_ONE)
    expect(result).toBe("OrderService:placeOrder(id: number) is called")
  })

  it("replaces existing params with new params", () => {
    const content = "OrderService:placeOrder(orderId: string) is called"
    const result = replaceSignatureInContent(content, "OrderService", "placeOrder", PARAMS_TWO)
    expect(result).toBe("OrderService:placeOrder(id: number, name: string?) is called")
  })

  it("preserves surrounding text and other lines unchanged", () => {
    const content = [
      "title My Diagram",
      "participant OrderService",
      "OrderService:placeOrder(old: string) -> Response",
      "note over OrderService: done",
    ].join("\n")
    const result = replaceSignatureInContent(content, "OrderService", "placeOrder", PARAMS_ONE)
    expect(result).toContain("title My Diagram")
    expect(result).toContain("participant OrderService")
    expect(result).toContain("OrderService:placeOrder(id: number)")
    expect(result).toContain("note over OrderService: done")
  })

  it("does not touch other function calls on the same interface", () => {
    const content = "OrderService:cancelOrder(id: string) then OrderService:placeOrder(old: string)"
    const result = replaceSignatureInContent(content, "OrderService", "placeOrder", PARAMS_ONE)
    expect(result).toContain("OrderService:cancelOrder(id: string)")
    expect(result).toContain("OrderService:placeOrder(id: number)")
  })

  it("does not touch a different interface's function with the same name", () => {
    const content = "PaymentService:placeOrder(x: string) and OrderService:placeOrder(old: string)"
    const result = replaceSignatureInContent(content, "OrderService", "placeOrder", PARAMS_ONE)
    expect(result).toContain("PaymentService:placeOrder(x: string)")
    expect(result).toContain("OrderService:placeOrder(id: number)")
  })

  it("handles multi-param signatures correctly", () => {
    const content = "UserService:getUsers()"
    const result = replaceSignatureInContent(content, "UserService", "getUsers", PARAMS_MULTI)
    expect(result).toBe("UserService:getUsers(userId: string, limit: number?, offset: number?)")
  })

  it("replaces with empty params (no-param signature)", () => {
    const content = "UserService:ping(old: string)"
    const result = replaceSignatureInContent(content, "UserService", "ping", PARAMS_NONE)
    expect(result).toBe("UserService:ping()")
  })

  it("returns content unchanged when there is no matching call", () => {
    const content = "UserService:doSomethingElse()"
    const result = replaceSignatureInContent(content, "UserService", "getUser", PARAMS_ONE)
    expect(result).toBe(content)
  })

  it("replaces all occurrences when the signature appears multiple times", () => {
    const content = "OrderService:placeOrder(old: string)\nOrderService:placeOrder(old: string)"
    const result = replaceSignatureInContent(content, "OrderService", "placeOrder", PARAMS_ONE)
    const lines = result.split("\n")
    expect(lines[0]).toBe("OrderService:placeOrder(id: number)")
    expect(lines[1]).toBe("OrderService:placeOrder(id: number)")
  })

  it("handles interface and function ids with special regex characters", () => {
    // The escape helper should prevent regex injection
    const content = "My.Service:get.User()"
    const result = replaceSignatureInContent(content, "My.Service", "get.User", PARAMS_ONE)
    expect(result).toBe("My.Service:get.User(id: number)")
  })
})
