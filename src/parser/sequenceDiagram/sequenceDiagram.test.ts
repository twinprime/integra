/**
 * Tests for the sequence diagram Chevrotain lexer, parser, and visitor.
 */
import { describe, it, expect } from "vitest"
import { SeqLexer } from "./lexer"
import { parseSequenceDiagramCst } from "./parser"
import { buildSeqAst } from "./visitor"

import type { SeqMessage, SeqNote } from "./visitor"

function parse(input: string) {
  const { cst, lexErrors, parseErrors } = parseSequenceDiagramCst(input)
  const ast = buildSeqAst(cst)
  // Convenience accessors matching old SeqAst shape, for easier test assertions
  const messages = ast.statements.filter((s): s is SeqMessage => "functionRef" in s)
  const notes = ast.statements.filter((s): s is SeqNote => "position" in s)
  return { ast: { ...ast, messages, notes }, lexErrors, parseErrors }
}

// ─── Lexer ────────────────────────────────────────────────────────────────────

describe("sequence diagram lexer", () => {
  it("tokenises a declaration line", () => {
    const { errors, tokens } = SeqLexer.tokenize("actor sim_leader")
    expect(errors).toHaveLength(0)
    const names = tokens.map((t) => t.tokenType.name)
    expect(names).toEqual(["Actor", "Identifier"])
  })

  it("tokenises an arrow line", () => {
    const { errors, tokens } = SeqLexer.tokenize("a --> b")
    expect(errors).toHaveLength(0)
    expect(tokens.map((t) => t.tokenType.name)).toEqual(["Identifier", "Arrow", "Identifier"])
  })

  it("tokenises a function-ref label into FunctionRef token", () => {
    const { errors, tokens } = SeqLexer.tokenize("a --> b: IFace:fn(x: string)")
    expect(errors).toHaveLength(0)
    const names = tokens.map((t) => t.tokenType.name)
    expect(names).toContain("FunctionRef")
    expect(names).not.toContain("LabelText")
  })

  it("tokenises a plain-text label into LabelText token", () => {
    const { errors, tokens } = SeqLexer.tokenize("a --> b: do something")
    expect(errors).toHaveLength(0)
    const names = tokens.map((t) => t.tokenType.name)
    expect(names).toContain("LabelText")
    expect(names).not.toContain("FunctionRef")
  })

  it("produces no errors for multi-line input", () => {
    const input = "actor user\ncomponent svc\nuser --> svc: IFace:doWork()"
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
    const { ast, parseErrors } = parse("actor a\nactor b\na --> b")
    expect(parseErrors).toHaveLength(0)
    expect(ast.messages).toHaveLength(1)
    expect(ast.messages[0]).toMatchObject({ from: "a", to: "b", functionRef: null, label: null })
  })

  it("parses a message with a plain-text label", () => {
    const { ast } = parse("a --> b: view running simulations")
    expect(ast.messages[0]).toMatchObject({ from: "a", to: "b", label: "view running simulations", functionRef: null })
  })

  it("parses a message with a function-ref label", () => {
    const { ast } = parse("a --> b: IFace:doWork(x: string)")
    expect(ast.messages[0]).toMatchObject({
      from: "a", to: "b",
      functionRef: { interfaceId: "IFace", functionId: "doWork", rawParams: "x: string" },
      label: null,
    })
  })

  it("parses a function ref with no parameters", () => {
    const { ast } = parse("a --> b: IFace:trigger()")
    expect(ast.messages[0].functionRef).toMatchObject({ interfaceId: "IFace", functionId: "trigger", rawParams: "" })
  })

  it("parses a function ref with multiple parameters", () => {
    const { ast } = parse("a --> b: IFace:fn(x: string, y: number)")
    expect(ast.messages[0].functionRef?.rawParams).toBe("x: string, y: number")
  })

  it("parses a self-referencing message", () => {
    const { ast } = parse("a --> a: IFace:fn()")
    expect(ast.messages[0]).toMatchObject({ from: "a", to: "a" })
  })

  it("handles multiple messages after declarations", () => {
    const input = `actor sim_leader
component fts
sim_leader --> fts: view running simulations
sim_leader --> fts: cancel simulation
component adict
fts --> adict: EventRecording:dataStreamTerminated(topic: String)
adict --> adict: stop event recording and remove recorded data`
    const { ast, lexErrors, parseErrors } = parse(input)
    expect(lexErrors).toHaveLength(0)
    expect(parseErrors).toHaveLength(0)
    expect(ast.declarations).toHaveLength(3)
    expect(ast.messages).toHaveLength(4)
    expect(ast.messages[0].label).toBe("view running simulations")
    expect(ast.messages[2].functionRef?.interfaceId).toBe("EventRecording")
    expect(ast.messages[3].label).toBe("stop event recording and remove recorded data")
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
    const { ast } = parse("a --> b: first\\nsecond")
    expect(ast.messages[0].label).toBe("first\nsecond")
  })
})

describe("sequence diagram parser — multi-word participants", () => {
  it("parses a message with multi-word receiver", () => {
    const { ast, lexErrors, parseErrors } = parse("fts --> Output Topics: Initial AIP data")
    expect(lexErrors).toHaveLength(0)
    expect(parseErrors).toHaveLength(0)
    expect(ast.messages[0]).toMatchObject({ from: "fts", to: "Output Topics", label: "Initial AIP data" })
  })

  it("parses a message with multi-word sender", () => {
    const { ast } = parse("Output Topics --> fts: ack")
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
sim_leader --> fts: view running simulations
fts --> Output Topics: Initial AIP data (separate topics)
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
    const input = `a --> b: first message
note over a: between note
a --> b: second message`
    const { ast, parseErrors } = parse(input)
    expect(parseErrors).toHaveLength(0)
    expect(ast.statements).toHaveLength(3)
    expect("functionRef" in ast.statements[0]).toBe(true)   // message
    expect("position" in ast.statements[1]).toBe(true)      // note
    expect("functionRef" in ast.statements[2]).toBe(true)   // message
  })

  it("preserves note at the beginning", () => {
    const { ast } = parse("note right of a: intro\na --> b: msg")
    expect("position" in ast.statements[0]).toBe(true)
    expect("functionRef" in ast.statements[1]).toBe(true)
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
    const { ast, parseErrors } = parse("a --> b: some label")
    expect(parseErrors).toHaveLength(0)
    expect(ast.messages[0].label).toBe("some label")
  })
})

// ─── parseSequenceDiagram — scope validation ──────────────────────────────────

import { parseSequenceDiagram } from "./systemUpdater"
import type { ComponentNode } from "../../store/types"

const makeComp = (uuid: string, id: string, subComponents: ComponentNode[] = []): ComponentNode => ({
  uuid, id, name: id, type: "component",
  actors: [], subComponents, useCaseDiagrams: [], interfaces: [],
})

describe("parseSequenceDiagram — out-of-scope reference", () => {
  it("throws when referencing a cousin (child of sibling)", () => {
    // Tree: root → ownerComp, sibling → cousin
    const cousin = makeComp("cousin-uuid", "cousin")
    const sibling = makeComp("sibling-uuid", "sibling", [cousin])
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp, sibling])
    // "sibling/cousin" is a cousin — out of scope
    expect(() =>
      parseSequenceDiagram("component sibling/cousin as c", root, ownerComp.uuid, "diag-uuid")
    ).toThrow("out of scope")
  })

  it("throws when referencing a deep cousin (grandchild of sibling)", () => {
    const deepCousin = makeComp("dc-uuid", "deepCousin")
    const cousin = makeComp("cousin-uuid", "cousin", [deepCousin])
    const sibling = makeComp("sibling-uuid", "sibling", [cousin])
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp, sibling])
    expect(() =>
      parseSequenceDiagram("component sibling/cousin/deepCousin as dc", root, ownerComp.uuid, "diag-uuid")
    ).toThrow("out of scope")
  })

  it("does NOT throw for a relative child reference", () => {
    const child = makeComp("child-uuid", "child")
    const ownerComp = makeComp("owner-uuid", "owner", [child])
    const root = makeComp("root-uuid", "root", [ownerComp])
    expect(() =>
      parseSequenceDiagram("component child", root, ownerComp.uuid, "diag-uuid")
    ).not.toThrow()
  })

  it("does NOT throw for a relative grandchild reference", () => {
    const grandchild = makeComp("gc-uuid", "gc")
    const child = makeComp("child-uuid", "child", [grandchild])
    const ownerComp = makeComp("owner-uuid", "owner", [child])
    const root = makeComp("root-uuid", "root", [ownerComp])
    expect(() =>
      parseSequenceDiagram("component child/gc", root, ownerComp.uuid, "diag-uuid")
    ).not.toThrow()
  })
})

// ─── generateSequenceMermaidFromAst — participant display labels ──────────────

import { generateSequenceMermaidFromAst } from "./mermaidGenerator"
import { buildSeqAst } from "./visitor"
import { parseSequenceDiagramCst } from "./parser"

function parseAst(content: string) {
  const { cst } = parseSequenceDiagramCst(content)
  return buildSeqAst(cst)
}

const makeNamedComp = (uuid: string, id: string, name: string, subComponents: ComponentNode[] = []): ComponentNode => ({
  uuid, id, name, type: "component",
  actors: [], subComponents, useCaseDiagrams: [], interfaces: [],
})

describe("generateSequenceMermaidFromAst — participant display labels", () => {
  it("uses node name instead of id for component participant", () => {
    const child = makeNamedComp("child-uuid", "svc", "Order Service")
    const owner = makeNamedComp("owner-uuid", "owner", "owner")
    owner.subComponents = [child]
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const ast = parseAst("component svc")
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("Order Service")
    expect(mermaidContent).not.toContain("«component»\nsvc")
  })

  it("uses node name even when alias is specified (alias is local id only)", () => {
    const child = makeNamedComp("child-uuid", "svc", "Order Service")
    const owner = makeNamedComp("owner-uuid", "owner", "owner")
    owner.subComponents = [child]
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const ast = parseAst("component svc as MyAlias")
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    // "MyAlias" is the Mermaid participant id; "Order Service" is the display label
    expect(mermaidContent).toContain("Order Service")
    expect(mermaidContent).toMatch(/participant MyAlias as .*Order Service/)
  })

  it("falls back to path segment when node not found", () => {
    const owner = makeNamedComp("owner-uuid", "owner", "owner")
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const ast = parseAst("component unknown")
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("unknown")
  })
})
