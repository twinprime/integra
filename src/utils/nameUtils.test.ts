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

  it("returns empty string for empty input", () => {
    expect(deriveNameFromId("")).toBe("")
  })

  it("uppercases a single character", () => {
    expect(deriveNameFromId("a")).toBe("A")
  })

  it("preserves all-uppercase input unchanged", () => {
    expect(deriveNameFromId("ABC")).toBe("ABC")
  })

  it("title-cases word that starts with a digit (digit is unchanged)", () => {
    expect(deriveNameFromId("123service")).toBe("123service")
    expect(deriveNameFromId("service1")).toBe("Service1")
  })

  it("produces an empty segment and double space for consecutive underscores", () => {
    expect(deriveNameFromId("my__service")).toBe("My  Service")
  })

  it("treats hyphens as ordinary characters (not separators)", () => {
    expect(deriveNameFromId("my-service")).toBe("My-service")
  })

  it("returns already-title-cased input unchanged when no underscores present", () => {
    expect(deriveNameFromId("My Service")).toBe("My Service")
  })

  it("uppercases first character of camelCase input without splitting", () => {
    expect(deriveNameFromId("myService")).toBe("MyService")
  })

  it("handles mixed-case word after underscore without altering internal casing", () => {
    expect(deriveNameFromId("my_HTTPService")).toBe("My HTTPService")
  })

  it("handles a very long underscore-separated string", () => {
    expect(deriveNameFromId("a_very_long_service_name_with_many_words_here")).toBe(
      "A Very Long Service Name With Many Words Here"
    )
  })
})
