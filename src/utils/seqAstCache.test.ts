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
})
