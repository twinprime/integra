import { describe, it, expect } from "vitest"
import { deriveNameFromId } from "./nameUtils"

describe("deriveNameFromId", () => {
  it("title-cases a single word", () => {
    expect(deriveNameFromId("alice")).toBe("Alice")
  })

  it("title-cases multiple underscore-separated words", () => {
    expect(deriveNameFromId("my_service")).toBe("My Service")
    expect(deriveNameFromId("user_profile_service")).toBe("User Profile Service")
  })

  it("returns single word with first letter uppercased when no underscore", () => {
    expect(deriveNameFromId("placeOrder")).toBe("PlaceOrder")
  })

  it("handles leading underscore gracefully", () => {
    expect(deriveNameFromId("_internal")).toBe(" Internal")
  })

  it("preserves already-uppercase letters within a word", () => {
    expect(deriveNameFromId("my_API")).toBe("My API")
  })
})
