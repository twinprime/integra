/**
 * Focused parser/visitor tests for sequence diagrams.
 */
import { describe, it, expect } from "vitest"
import { SeqLexer } from "./lexer"
import { parseSequenceDiagramCst } from "./parser"
import { buildSeqAst } from "./visitor"
import { seqAstToSpec } from "./specSerializer"
import { generateSequenceMermaidFromAst } from "./mermaidGenerator"
import { parse } from "./sequenceDiagram.test.helpers"

// ─── Lexer ────────────────────────────────────────────────────────────────────

describe("sequence diagram lexer", () => {
  it("tokenises a declaration line", () => {
    const { errors, tokens } = SeqLexer.tokenize("actor sim_leader")
    expect(errors).toHaveLength(0)
    const names = tokens.map((t) => t.tokenType.name)
    expect(names).toEqual(["Actor", "Identifier"])
  })

  it("tokenises an arrow line", () => {
    const { errors, tokens } = SeqLexer.tokenize("a ->> b")
    expect(errors).toHaveLength(0)
    expect(tokens.map((t) => t.tokenType.name)).toEqual(["Identifier", "SeqArrow", "Identifier"])
  })

  it("tokenises a function-ref label into FunctionRef token", () => {
    const { errors, tokens } = SeqLexer.tokenize("a ->> b: IFace:fn(x: string)")
    expect(errors).toHaveLength(0)
    const names = tokens.map((t) => t.tokenType.name)
    expect(names).toContain("FunctionRef")
    expect(names).not.toContain("LabelText")
  })

  it("tokenises a plain-text label into LabelText token", () => {
    const { errors, tokens } = SeqLexer.tokenize("a ->> b: do something")
    expect(errors).toHaveLength(0)
    const names = tokens.map((t) => t.tokenType.name)
    expect(names).toContain("LabelText")
    expect(names).not.toContain("FunctionRef")
  })

  it("produces no errors for multi-line input", () => {
    const input = "actor user\ncomponent svc\nuser ->> svc: IFace:doWork()"
    expect(SeqLexer.tokenize(input).errors).toHaveLength(0)
  })
})

// ─── Parser / visitor ────────────────────────────────────────────────────────

describe("sequence diagram parser — declarations", () => {
  it("parses a single actor declaration", () => {
    const { ast, lexErrors, parseErrors } = parse("actor sim_leader")
    expect(lexErrors).toHaveLength(0)
    expect(parseErrors).toHaveLength(0)
    expect(ast.declarations).toHaveLength(1)
    expect(ast.declarations[0]).toMatchObject({ entityType: "actor", path: ["sim_leader"], alias: null, id: "sim_leader" })
  })

  it("parses a single component declaration", () => {
    const { ast } = parse("component fts")
    expect(ast.declarations[0]).toMatchObject({ entityType: "component", path: ["fts"], id: "fts" })
  })

  it("parses a declaration with alias", () => {
    const { ast } = parse("actor sim_leader as leader")
    expect(ast.declarations[0]).toMatchObject({ entityType: "actor", path: ["sim_leader"], alias: "leader", id: "leader" })
  })

  it("parses a multi-segment component path", () => {
    const { ast } = parse("component root/services/auth")
    expect(ast.declarations[0]).toMatchObject({ entityType: "component", path: ["root", "services", "auth"], id: "auth" })
  })

  it("parses multiple declarations", () => {
    const { ast, parseErrors } = parse("actor user\ncomponent svc")
    expect(parseErrors).toHaveLength(0)
    expect(ast.declarations).toHaveLength(2)
    expect(ast.declarations[0].id).toBe("user")
    expect(ast.declarations[1].id).toBe("svc")
  })
})

describe("sequence diagram parser — messages", () => {
  it("parses a message without a label", () => {
    const { ast, parseErrors } = parse("actor a\nactor b\na ->> b")
    expect(parseErrors).toHaveLength(0)
    expect(ast.messages).toHaveLength(1)
    expect(ast.messages[0]).toMatchObject({ from: "a", to: "b", arrow: "->>", content: { kind: "none" } })
  })

  it("parses a message with a plain-text label", () => {
    const { ast } = parse("a ->> b: view running simulations")
    expect(ast.messages[0]).toMatchObject({ from: "a", to: "b", content: { kind: "label", text: "view running simulations" } })
  })

  it("parses a message with a function-ref label", () => {
    const { ast } = parse("a ->> b: IFace:doWork(x: string)")
    expect(ast.messages[0]).toMatchObject({
      from: "a", to: "b",
      content: { kind: "functionRef", interfaceId: "IFace", functionId: "doWork", rawParams: "x: string" },
    })
  })

  it("parses a function ref with no parameters", () => {
    const { ast } = parse("a ->> b: IFace:trigger()")
    expect(ast.messages[0].content).toMatchObject({ kind: "functionRef", interfaceId: "IFace", functionId: "trigger", rawParams: "", label: null })
  })

  it("parses a function ref with multiple parameters", () => {
    const { ast } = parse("a ->> b: IFace:fn(x: string, y: number)")
    expect((ast.messages[0].content as { rawParams: string }).rawParams).toBe("x: string, y: number")
  })

  it("parses a function ref with a display label suffix", () => {
    const { ast } = parse("a ->> b: IFace:login(x: string):my custom label")
    expect(ast.messages[0].content).toMatchObject({
      kind: "functionRef",
      interfaceId: "IFace",
      functionId: "login",
      rawParams: "x: string",
      label: "my custom label",
    })
  })

  it("converts \\n escape to newline in function ref display label", () => {
    const { ast } = parse("a ->> b: IFace:login():Line1\\nLine2")
    expect((ast.messages[0].content as { label: string | null }).label).toBe("Line1\nLine2")
  })

  it("tokenises function-ref with display label as a single FunctionRef token", () => {
    const { errors, tokens } = SeqLexer.tokenize("a ->> b: IFace:fn():do the thing")
    expect(errors).toHaveLength(0)
    const fnTok = tokens.find((t) => t.tokenType.name === "FunctionRef")
    expect(fnTok?.image).toBe("IFace:fn():do the thing")
  })

  it("function-ref without display label has null label", () => {
    const { ast } = parse("a ->> b: IFace:trigger()")
    expect((ast.messages[0].content as { label: string | null }).label).toBeNull()
  })

  it("function-ref with trailing colon and empty label has null label", () => {
    const { ast } = parse("a ->> b: IFace:trigger():")
    expect(ast.messages[0].content.kind).toBe("functionRef")
    expect((ast.messages[0].content as { label: string | null }).label).toBeNull()
  })

  it("parses a self-referencing message", () => {
    const { ast } = parse("a ->> a: IFace:fn()")
    expect(ast.messages[0]).toMatchObject({ from: "a", to: "a" })
  })

  it("handles multiple messages after declarations", () => {
    const input = `actor sim_leader
component fts
sim_leader ->> fts: view running simulations
sim_leader ->> fts: cancel simulation
component adict
fts ->> adict: EventRecording:dataStreamTerminated(topic: String)
adict ->> adict: stop event recording and remove recorded data`
    const { ast, lexErrors, parseErrors } = parse(input)
    expect(lexErrors).toHaveLength(0)
    expect(parseErrors).toHaveLength(0)
    expect(ast.declarations).toHaveLength(3)
    expect(ast.messages).toHaveLength(4)
    expect((ast.messages[0].content as { text: string }).text).toBe("view running simulations")
    expect((ast.messages[2].content as { interfaceId: string }).interfaceId).toBe("EventRecording")
    expect((ast.messages[3].content as { text: string }).text).toBe("stop event recording and remove recorded data")
  })
})

describe("sequence diagram parser — notes", () => {
  it("parses note right of", () => {
    const { ast, parseErrors } = parse("actor a\nnote right of a: some text")
    expect(parseErrors).toHaveLength(0)
    expect(ast.notes).toHaveLength(1)
    expect(ast.notes[0]).toMatchObject({ position: { kind: "side", side: "right", participant: "a" }, text: "some text" })
  })

  it("parses note left of", () => {
    const { ast } = parse("note left of a: text here")
    expect(ast.notes[0].position).toMatchObject({ kind: "side", side: "left", participant: "a" })
  })

  it("parses note over single participant", () => {
    const { ast } = parse("note over a: text here")
    expect(ast.notes[0].position).toMatchObject({ kind: "over", participants: ["a", null] })
  })

  it("parses note over two participants", () => {
    const { ast } = parse("note over a, b: text here")
    expect(ast.notes[0].position).toMatchObject({ kind: "over", participants: ["a", "b"] })
  })

  it("replaces \\n escape with newline character in note text", () => {
    const { ast } = parse("note right of a: line1\\nline2")
    expect(ast.notes[0].text).toBe("line1\nline2")
  })
})

describe("sequence diagram parser — label escapes", () => {
  it("replaces \\n with newline in plain-text labels", () => {
    const { ast } = parse("a ->> b: first\\nsecond")
    expect((ast.messages[0].content as { text: string }).text).toBe("first\nsecond")
  })
})

describe("sequence diagram parser — arrow types", () => {
  const arrowCases: [string, string][] = [
    ["->>",  "solid arrowhead (sync)"],
    ["-->>", "dotted arrowhead (async reply)"],
    ["->",   "solid, no arrowhead"],
    ["-->",  "dotted, no arrowhead"],
    ["-x",   "solid X (destroy)"],
    ["--x",  "dotted X"],
    ["-)  ", "solid open arrowhead"],
    ["--) ", "dotted open arrowhead"],
  ]

  for (const [arrow] of arrowCases) {
    it(`parses arrow "${arrow.trim()}"`, () => {
      const trimmed = arrow.trim()
      const { ast, lexErrors, parseErrors } = parse(`actor a\nactor b\na ${trimmed} b`)
      expect(lexErrors).toHaveLength(0)
      expect(parseErrors).toHaveLength(0)
      expect(ast.messages[0].arrow).toBe(trimmed)
    })
  }

  it("round-trips -->> (async reply) through spec serializer", () => {
    const { cst } = parseSequenceDiagramCst("actor a\nactor b\na -->> b: reply")
    const ast = buildSeqAst(cst)
    const spec = seqAstToSpec(ast)
    expect(spec).toContain("a -->> b: reply")
  })

  it("emits -->> arrow in mermaid output", () => {
    const owner = { uuid: "o", id: "owner", name: "owner", type: "component" as const, actors: [], subComponents: [], useCaseDiagrams: [], interfaces: [] }
    const root = { ...owner, uuid: "r", id: "root", subComponents: [owner] }
    const { cst } = parseSequenceDiagramCst("actor a\nactor b\na -->> b: reply")
    const ast = buildSeqAst(cst)
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("a-->>b: reply")
  })
})

describe("sequence diagram parser — multi-word participants", () => {
  it("parses a message with multi-word receiver", () => {
    const { ast, lexErrors, parseErrors } = parse("fts ->> Output Topics: Initial AIP data")
    expect(lexErrors).toHaveLength(0)
    expect(parseErrors).toHaveLength(0)
    expect(ast.messages[0]).toMatchObject({ from: "fts", to: "Output Topics", content: { kind: "label", text: "Initial AIP data" } })
  })

  it("parses a message with multi-word sender", () => {
    const { ast } = parse("Output Topics ->> fts: ack")
    expect(ast.messages[0]).toMatchObject({ from: "Output Topics", to: "fts" })
  })

  it("parses a note over with multi-word participant", () => {
    const { ast, parseErrors } = parse("note over fts,Output Topics: if custom AIP set is used")
    expect(parseErrors).toHaveLength(0)
    expect(ast.notes[0].position).toMatchObject({
      kind: "over",
      participants: ["fts", "Output Topics"],
    })
    expect(ast.notes[0].text).toBe("if custom AIP set is used")
  })

  it("parses note right of with multi-word participant", () => {
    const { ast, parseErrors } = parse("note right of Output Topics: note text")
    expect(parseErrors).toHaveLength(0)
    expect(ast.notes[0].position).toMatchObject({ kind: "side", side: "right", participant: "Output Topics" })
  })

  it("parses the full user example", () => {
    const input = `actor sim_leader
component fts
sim_leader ->> fts: view running simulations
fts ->> Output Topics: Initial AIP data (separate topics)
note over fts,Output Topics: if custom AIP set is used`
    const { ast, lexErrors, parseErrors } = parse(input)
    expect(lexErrors).toHaveLength(0)
    expect(parseErrors).toHaveLength(0)
    expect(ast.declarations).toHaveLength(2)
    expect(ast.messages).toHaveLength(2)
    expect(ast.messages[1]).toMatchObject({ from: "fts", to: "Output Topics" })
    expect(ast.notes[0].position).toMatchObject({ kind: "over", participants: ["fts", "Output Topics"] })
  })
})

describe("sequence diagram parser — statement ordering", () => {
  it("preserves note position between messages in statements array", () => {
    const input = `a ->> b: first message
note over a: between note
a ->> b: second message`
    const { ast, parseErrors } = parse(input)
    expect(parseErrors).toHaveLength(0)
    expect(ast.statements).toHaveLength(3)
    expect("content" in ast.statements[0]).toBe(true)   // message
    expect("position" in ast.statements[1]).toBe(true)      // note
    expect("content" in ast.statements[2]).toBe(true)   // message
  })

  it("preserves note at the beginning", () => {
    const { ast } = parse("note right of a: intro\na ->> b: msg")
    expect("position" in ast.statements[0]).toBe(true)
    expect("content" in ast.statements[1]).toBe(true)
  })
})


describe("sequence diagram parser — edge cases", () => {
  it("handles leading blank lines", () => {
    const { ast, parseErrors } = parse("\n\nactor user")
    expect(parseErrors).toHaveLength(0)
    expect(ast.declarations[0].id).toBe("user")
  })

  it("handles trailing newline", () => {
    const { ast, parseErrors } = parse("actor user\n")
    expect(parseErrors).toHaveLength(0)
    expect(ast.declarations[0].id).toBe("user")
  })

  it("handles blank lines between statements", () => {
    const { ast, parseErrors } = parse("actor user\n\ncomponent svc")
    expect(parseErrors).toHaveLength(0)
    expect(ast.declarations).toHaveLength(2)
  })

  it("handles input without trailing newline after labeled message", () => {
    const { ast, parseErrors } = parse("a ->> b: some label")
    expect(parseErrors).toHaveLength(0)
    expect((ast.messages[0].content as { text: string }).text).toBe("some label")
  })
})
