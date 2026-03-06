/**
 * Tests for ucdAstToSpec (round-trip) and renameInUcdSpec (AST-based rename).
 */
import { describe, it, expect } from "vitest"
import { ucdAstToSpec, renameInUcdSpec } from "./specSerializer"
import { parseUseCaseDiagramCst } from "./parser"
import { buildUcdAst } from "./visitor"

function roundTrip(content: string): string {
  const { cst } = parseUseCaseDiagramCst(content)
  return ucdAstToSpec(buildUcdAst(cst))
}

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe("ucdAstToSpec — round-trip", () => {
  it("round-trips an actor declaration", () => {
    expect(roundTrip("actor login")).toBe("actor login")
  })

  it("round-trips a component declaration", () => {
    expect(roundTrip("component AuthService")).toBe("component AuthService")
  })

  it("round-trips a use case declaration", () => {
    expect(roundTrip("use case placeOrder")).toBe("use case placeOrder")
  })

  it("round-trips a path declaration", () => {
    expect(roundTrip("actor root/customer")).toBe("actor root/customer")
  })

  it("round-trips an alias declaration", () => {
    expect(roundTrip("actor userId as customer")).toBe("actor userId as customer")
  })

  it("round-trips a link", () => {
    expect(roundTrip("actor user\nuse case login\nuser --> login")).toBe(
      "actor user\nuse case login\nuser --> login",
    )
  })

  it("normalizes blank lines (acceptable trade-off)", () => {
    expect(roundTrip("actor user\n\nuse case login")).toBe("actor user\nuse case login")
  })
})

// ─── renameInUcdSpec ──────────────────────────────────────────────────────────

describe("renameInUcdSpec — declarations", () => {
  it("renames an actor declaration", () => {
    expect(renameInUcdSpec("actor login", "login", "signIn")).toBe("actor signIn")
  })

  it("renames a component declaration", () => {
    expect(renameInUcdSpec("component AuthService", "AuthService", "Auth")).toBe("component Auth")
  })

  it("renames a use case declaration", () => {
    expect(renameInUcdSpec("use case placeOrder", "placeOrder", "createOrder")).toBe(
      "use case createOrder",
    )
  })

  it("renames a path segment in a path declaration", () => {
    expect(renameInUcdSpec("actor root/customer as c", "customer", "user")).toBe(
      "actor root/user as c",
    )
  })

  it("does NOT rename inside an alias", () => {
    expect(renameInUcdSpec("actor userId as customer", "customer", "user")).toBe(
      "actor userId as customer",
    )
  })
})

describe("renameInUcdSpec — links", () => {
  it("renames the from side of a link", () => {
    expect(
      renameInUcdSpec("actor login\nuse case uc\nlogin --> uc", "login", "signIn"),
    ).toBe("actor signIn\nuse case uc\nsignIn --> uc")
  })

  it("renames the to side of a link", () => {
    expect(
      renameInUcdSpec("actor user\nuse case placeOrder\nuser --> placeOrder", "placeOrder", "createOrder"),
    ).toBe("actor user\nuse case createOrder\nuser --> createOrder")
  })
})

describe("renameInUcdSpec — hyphen safety", () => {
  it("does NOT corrupt a hyphenated ID when renaming a prefix", () => {
    const spec = "actor api\ncomponent api-service\napi --> api-service"
    const result = renameInUcdSpec(spec, "api", "gateway")
    expect(result).toContain("actor gateway")
    expect(result).toContain("component api-service")
    expect(result).toContain("gateway --> api-service")
  })

  it("correctly renames a hyphenated ID itself", () => {
    const result = renameInUcdSpec(
      "actor api-user\nuse case uc\napi-user --> uc",
      "api-user",
      "customer",
    )
    expect(result).toContain("actor customer")
    expect(result).toContain("customer --> uc")
  })
})

describe("renameInUcdSpec — no false positives", () => {
  it("does not rename a partial match inside a longer id", () => {
    const spec = "use case placeOrder\nactor user\nuser --> placeOrder"
    expect(renameInUcdSpec(spec, "place", "create")).toBe(spec)
  })
})

describe("renameInUcdSpec — invalid spec fallback", () => {
  it("returns original content when spec cannot be parsed", () => {
    const bad = "@@@ invalid spec"
    expect(renameInUcdSpec(bad, "login", "signIn")).toBe(bad)
  })

  it("returns empty string unchanged", () => {
    expect(renameInUcdSpec("", "login", "signIn")).toBe("")
  })
})
