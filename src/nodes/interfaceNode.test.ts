import { describe, it, expect } from "vitest"
import { applyIdRenameInInterface, applyIdRenameInFunction, findIdInInterface } from "./interfaceNode"
import type { InterfaceSpecification } from "../store/types"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeIface(overrides: Partial<InterfaceSpecification> = {}): InterfaceSpecification {
  return {
    uuid: "iface-uuid",
    id: "UserAPI",
    name: "User API",
    type: "rest",
    functions: [
      { uuid: "fn-uuid", id: "getUser", parameters: [] },
      { uuid: "fn2-uuid", id: "createUser", parameters: [] },
    ],
    ...overrides,
  }
}

// ─── applyIdRenameInInterface ─────────────────────────────────────────────────

describe("applyIdRenameInInterface", () => {
  it("renames the interface id when its UUID matches the target", () => {
    const iface = makeIface()
    const result = applyIdRenameInInterface(iface, "iface-uuid", "UserAPI", "AccountAPI")
    expect(result.id).toBe("AccountAPI")
  })

  it("does not rename the interface id when UUID does not match", () => {
    const iface = makeIface()
    const result = applyIdRenameInInterface(iface, "other-uuid", "UserAPI", "AccountAPI")
    expect(result.id).toBe("UserAPI")
  })

  it("renames a function's id when the function UUID matches the target", () => {
    const iface = makeIface()
    const result = applyIdRenameInInterface(iface, "fn-uuid", "getUser", "fetchUser")
    expect(result.functions[0].id).toBe("fetchUser")
    expect(result.functions[1].id).toBe("createUser") // unchanged
  })

  it("updates description references when oldId appears as a markdown link path segment", () => {
    const iface = makeIface({ description: "See [UserAPI docs](UserAPI) for details" })
    const result = applyIdRenameInInterface(iface, "other-uuid", "UserAPI", "AccountAPI")
    expect(result.description).toContain("(AccountAPI)")
  })

  it("returns a new object (immutable)", () => {
    const iface = makeIface()
    const result = applyIdRenameInInterface(iface, "iface-uuid", "UserAPI", "AccountAPI")
    expect(result).not.toBe(iface)
  })

  it("leaves description undefined when not set", () => {
    const iface = makeIface()
    const result = applyIdRenameInInterface(iface, "iface-uuid", "UserAPI", "AccountAPI")
    expect(result.description).toBeUndefined()
  })
})

// ─── applyIdRenameInFunction ──────────────────────────────────────────────────

describe("applyIdRenameInFunction", () => {
  it("renames the function id when its UUID matches the target", () => {
    const fn = { uuid: "fn-uuid", id: "getUser", parameters: [] }
    const result = applyIdRenameInFunction(fn, "fn-uuid", "getUser", "fetchUser")
    expect(result.id).toBe("fetchUser")
  })

  it("does not rename the function id when UUID does not match", () => {
    const fn = { uuid: "fn-uuid", id: "getUser", parameters: [] }
    const result = applyIdRenameInFunction(fn, "other-uuid", "getUser", "fetchUser")
    expect(result.id).toBe("getUser")
  })

  it("updates description references when oldId appears as a markdown link path segment", () => {
    const fn = { uuid: "fn-uuid", id: "getUser", parameters: [], description: "See [docs](getUser) for info" }
    const result = applyIdRenameInFunction(fn, "other-uuid", "getUser", "fetchUser")
    expect(result.description).toContain("(fetchUser)")
  })

  it("leaves description undefined when not set", () => {
    const fn = { uuid: "fn-uuid", id: "getUser", parameters: [] }
    const result = applyIdRenameInFunction(fn, "fn-uuid", "getUser", "fetchUser")
    expect(result.description).toBeUndefined()
  })

  it("returns a new object (immutable)", () => {
    const fn = { uuid: "fn-uuid", id: "getUser", parameters: [] }
    const result = applyIdRenameInFunction(fn, "fn-uuid", "getUser", "fetchUser")
    expect(result).not.toBe(fn)
  })
})

// ─── findIdInInterface ────────────────────────────────────────────────────────

describe("findIdInInterface", () => {
  it("returns the interface id when UUID matches the interface itself", () => {
    const iface = makeIface()
    expect(findIdInInterface(iface, "iface-uuid")).toBe("UserAPI")
  })

  it("returns the function id when UUID matches a function", () => {
    const iface = makeIface()
    expect(findIdInInterface(iface, "fn-uuid")).toBe("getUser")
  })

  it("returns another function id when UUID matches the second function", () => {
    const iface = makeIface()
    expect(findIdInInterface(iface, "fn2-uuid")).toBe("createUser")
  })

  it("returns null when UUID is not found", () => {
    const iface = makeIface()
    expect(findIdInInterface(iface, "nonexistent")).toBeNull()
  })
})
