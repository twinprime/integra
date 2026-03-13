// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"
import * as parser from "../parser/sequenceDiagram/parser"
import { getCachedSeqAst, clearSeqAstCache } from "./seqAstCache"

describe("getCachedSeqAst", () => {
  beforeEach(() => {
    clearSeqAstCache()
    vi.restoreAllMocks()
  })

  it("parses content on first call", () => {
    const spy = vi.spyOn(parser, "parseSequenceDiagramCst")
    const content = "component A\nA ->> A: A.fn()"
    getCachedSeqAst(content)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("returns cached AST on second call with same content", () => {
    const content = "component A\nA ->> A: A.fn()"
    const ast1 = getCachedSeqAst(content)
    const spy = vi.spyOn(parser, "parseSequenceDiagramCst")
    const ast2 = getCachedSeqAst(content)
    expect(spy).not.toHaveBeenCalled()
    expect(ast1).toBe(ast2)
  })

  it("parses different content separately", () => {
    const spy = vi.spyOn(parser, "parseSequenceDiagramCst")
    getCachedSeqAst("component A\nA ->> A: A.fn()")
    getCachedSeqAst("component B\nB ->> B: B.fn()")
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it("returns empty AST for empty string without calling parser", () => {
    const spy = vi.spyOn(parser, "parseSequenceDiagramCst")
    const result = getCachedSeqAst("")
    expect(spy).not.toHaveBeenCalled()
    expect(result).toEqual({ declarations: [], statements: [] })
  })

  it("returns empty AST for whitespace-only content without calling parser", () => {
    const spy = vi.spyOn(parser, "parseSequenceDiagramCst")
    const result = getCachedSeqAst("   \n  ")
    expect(spy).not.toHaveBeenCalled()
    expect(result).toEqual({ declarations: [], statements: [] })
  })

  it("throws for malformed content that the visitor cannot process", () => {
    // The parser produces a CST with errors but the visitor then throws when
    // it encounters an unexpected structure (e.g. no recognisable top-level rule).
    expect(() => getCachedSeqAst("not a diagram")).toThrow()
  })

  it("parses very long content without throwing", () => {
    const lines = ["component A", "component B"]
    for (let i = 0; i < 100; i++) {
      lines.push(`A ->> B: message${i}()`)
    }
    const content = lines.join("\n")
    expect(() => getCachedSeqAst(content)).not.toThrow()
    const result = getCachedSeqAst(content)
    expect(result).toHaveProperty("statements")
    expect(result.statements.length).toBeGreaterThan(0)
  })
})

describe("clearSeqAstCache", () => {
  beforeEach(() => {
    clearSeqAstCache()
    vi.restoreAllMocks()
  })

  it("forces re-parse after cache is cleared", () => {
    const content = "component A\nA ->> A: A.fn()"
    getCachedSeqAst(content)

    clearSeqAstCache()

    const spy = vi.spyOn(parser, "parseSequenceDiagramCst")
    getCachedSeqAst(content)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("does not throw when called on an empty cache", () => {
    expect(() => clearSeqAstCache()).not.toThrow()
  })
})
