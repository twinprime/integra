/* eslint-disable max-lines */
/**
 * Tests for the sequence diagram Chevrotain lexer, parser, and visitor.
 */
import { describe, it, expect } from "vitest"
import { SeqLexer } from "./lexer"
import { parseSequenceDiagramCst } from "./parser"
import { buildSeqAst } from "./visitor"
import { seqAstToSpec } from "./specSerializer"
import { generateSequenceMermaidFromAst } from "./mermaidGenerator"

import type { SeqMessage, SeqNote, SeqBlock } from "./visitor"

function parse(input: string) {
  const { cst, lexErrors, parseErrors } = parseSequenceDiagramCst(input)
  const ast = buildSeqAst(cst)
  // Convenience accessors matching old SeqAst shape, for easier test assertions
  const messages = ast.statements.filter((s): s is SeqMessage => "content" in s)
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

describe("parseSequenceDiagram — auto-create missing path nodes", () => {
  it("auto-creates a missing sub-component when path parent exists", () => {
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp])
    // "newChild" does not yet exist under ownerComp
    const updated = parseSequenceDiagram("component owner/newChild", root, ownerComp.uuid, "diag-uuid")
    const updatedOwner = updated.subComponents.find((c) => c.uuid === ownerComp.uuid)!
    expect(updatedOwner.subComponents.some((c) => c.id === "newChild")).toBe(true)
  })

  it("auto-creates a missing actor when path parent exists", () => {
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp])
    const updated = parseSequenceDiagram("actor owner/NewUser", root, ownerComp.uuid, "diag-uuid")
    const updatedOwner = updated.subComponents.find((c) => c.uuid === ownerComp.uuid)!
    expect(updatedOwner.actors.some((a) => a.id === "NewUser")).toBe(true)
  })

  it("auto-creates intermediate component nodes when multiple segments are missing", () => {
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp])
    // "mid" and "leaf" both missing under ownerComp
    const updated = parseSequenceDiagram("component owner/mid/leaf", root, ownerComp.uuid, "diag-uuid")
    const updatedOwner = updated.subComponents.find((c) => c.uuid === ownerComp.uuid)!
    const mid = updatedOwner.subComponents.find((c) => c.id === "mid")
    expect(mid).toBeDefined()
    expect(mid!.subComponents.some((c) => c.id === "leaf")).toBe(true)
  })

  it("still throws for out-of-scope auto-create attempt (cousin path)", () => {
    const cousin = makeComp("cousin-uuid", "cousin")
    const sibling = makeComp("sibling-uuid", "sibling", [cousin])
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp, sibling])
    // sibling/cousin/newDeepCousin would be out of scope
    expect(() =>
      parseSequenceDiagram("component sibling/cousin/newDeepCousin", root, ownerComp.uuid, "diag-uuid")
    ).toThrow()
  })
})

// ─── parseSequenceDiagram — inherited interface functions ─────────────────────

describe("parseSequenceDiagram — inherited interface functions", () => {
  const makeCompWithIfaces = (
    uuid: string,
    id: string,
    interfaces: ComponentNode["interfaces"],
    subComponents: ComponentNode[] = [],
  ): ComponentNode => ({
    uuid, id, name: id, type: "component",
    actors: [], subComponents, useCaseDiagrams: [], interfaces,
  })

  it("does NOT throw when a message references a function on an inherited interface", () => {
    // ownerComp (DataService) owns the parent interface with actual functions.
    // CheckoutService is a subComponent of ownerComp and inherits the interface.
    const parentIface = {
      uuid: "iface-parent-uuid",
      id: "DataServing",
      name: "DataServing",
      type: "rest" as const,
      functions: [{ uuid: "fn-record-uuid", id: "record", parameters: [] }],
    }
    const childIface = {
      uuid: "iface-child-uuid",
      id: "DataServing",
      name: "DataServing",
      type: "rest" as const,
      functions: [],
      parentInterfaceUuid: "iface-parent-uuid",
    }
    const checkout = makeCompWithIfaces("checkout-uuid", "CheckoutService", [childIface])
    const ownerComp = makeCompWithIfaces("owner-uuid", "DataService", [parentIface], [checkout])
    const root = makeCompWithIfaces("root-uuid", "root", [], [ownerComp])

    const content = "actor user\ncomponent CheckoutService\nuser ->> CheckoutService: DataServing:record()"
    expect(() =>
      parseSequenceDiagram(content, root, ownerComp.uuid, "diag-uuid")
    ).not.toThrow()
  })

  it("still throws when referencing a function that does not exist on the parent interface", () => {
    const parentIface = {
      uuid: "iface-parent-uuid",
      id: "DataServing",
      name: "DataServing",
      type: "rest" as const,
      functions: [{ uuid: "fn-record-uuid", id: "record", parameters: [] }],
    }
    const childIface = {
      uuid: "iface-child-uuid",
      id: "DataServing",
      name: "DataServing",
      type: "rest" as const,
      functions: [],
      parentInterfaceUuid: "iface-parent-uuid",
    }
    const checkout = makeCompWithIfaces("checkout-uuid", "CheckoutService", [childIface])
    const ownerComp = makeCompWithIfaces("owner-uuid", "DataService", [parentIface], [checkout])
    const root = makeCompWithIfaces("root-uuid", "root", [], [ownerComp])

    // "nonExistent" is not on the parent interface — should still be locked
    const content = "actor user\ncomponent CheckoutService\nuser ->> CheckoutService: DataServing:nonExistent()"
    expect(() =>
      parseSequenceDiagram(content, root, ownerComp.uuid, "diag-uuid")
    ).toThrow("locked")
  })
})

// ─── generateSequenceMermaidFromAst — participant display labels ──────────────

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

// ─── undeclared receivers ─────────────────────────────────────────────────────

describe("sequence diagram — undeclared receiver", () => {
  it("allows digit-only word in participant ref (e.g. 'Output Topics 2')", () => {
    const { ast, lexErrors, parseErrors } = parse("actor sender\nsender ->> Output Topics 2")
    expect(lexErrors).toHaveLength(0)
    expect(parseErrors).toHaveLength(0)
    expect(ast.messages[0].to).toBe("Output Topics 2")
  })

  it("auto-declares undeclared receiver with original spaced name as label", () => {
    const owner = makeNamedComp("owner-uuid", "owner", "owner")
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const ast = parseAst("actor sender\nsender ->> Output Topics 2")
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("participant Output_Topics_2 as Output Topics 2")
  })

  it("does not double-declare a receiver that is already declared", () => {
    const child = makeNamedComp("svc-uuid", "svc", "My Service")
    const owner = makeNamedComp("owner-uuid", "owner", "owner")
    owner.subComponents = [child]
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const ast = parseAst("component svc\nactor sender\nsender -->> svc")
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    const matches = mermaidContent.match(/participant svc/g)
    expect(matches).toHaveLength(1)
  })
})

// ─── UseCaseRef token ──────────────────────────────────────────────────────────

import { UseCaseRef } from "./lexer"
import { resolveUseCaseByPath } from "../../utils/diagramResolvers"

describe("UseCaseRef — lexer", () => {
  it("tokenises local UseCase reference (no slash)", () => {
    const result = SeqLexer.tokenize("actor sender\nsender ->> receiver: UseCase:placeOrder")
    const ucToks = result.tokens.filter((t) => t.tokenType === UseCaseRef)
    expect(ucToks).toHaveLength(1)
    expect(ucToks[0].image).toBe("UseCase:placeOrder")
  })

  it("tokenises path UseCase reference (with slashes)", () => {
    const result = SeqLexer.tokenize("actor sender\nsender ->> receiver: UseCase:root/orders/placeOrder")
    const ucToks = result.tokens.filter((t) => t.tokenType === UseCaseRef)
    expect(ucToks).toHaveLength(1)
    expect(ucToks[0].image).toBe("UseCase:root/orders/placeOrder")
  })

  it("tokenises UseCase reference with custom label", () => {
    const result = SeqLexer.tokenize("actor sender\nsender ->> receiver: UseCase:placeOrder:Place an order")
    const ucToks = result.tokens.filter((t) => t.tokenType === UseCaseRef)
    expect(ucToks).toHaveLength(1)
    expect(ucToks[0].image).toBe("UseCase:placeOrder:Place an order")
  })

  it("does NOT tokenise plain labels as UseCaseRef", () => {
    const result = SeqLexer.tokenize("actor sender\nsender ->> receiver: some plain label")
    const ucToks = result.tokens.filter((t) => t.tokenType === UseCaseRef)
    expect(ucToks).toHaveLength(0)
  })
})

describe("UseCaseRef — visitor (SeqMessage.useCaseRef)", () => {
  it("populates useCaseRef for local reference", () => {
    const { ast } = parse("actor a\ncomponent b\na ->> b: UseCase:placeOrder")
    expect(ast.messages[0].content).toEqual({ kind: "useCaseRef", path: ["placeOrder"], label: null })
    expect(ast.messages[0].content.kind).not.toBe("functionRef")
    expect(ast.messages[0].content.kind).not.toBe("label")
  })

  it("populates useCaseRef for path reference", () => {
    const { ast } = parse("actor a\ncomponent b\na ->> b: UseCase:root/orders/placeOrder")
    expect(ast.messages[0].content).toEqual({ kind: "useCaseRef", path: ["root", "orders", "placeOrder"], label: null })
  })

  it("populates useCaseRef with custom label", () => {
    const { ast } = parse("actor a\ncomponent b\na ->> b: UseCase:placeOrder:Place an order")
    expect(ast.messages[0].content).toEqual({ kind: "useCaseRef", path: ["placeOrder"], label: "Place an order" })
  })

  it("converts \\n escape to newline in use case ref custom label", () => {
    const { ast } = parse("actor a\ncomponent b\na ->> b: UseCase:placeOrder:Place\\nOrder")
    expect((ast.messages[0].content as { label: string | null }).label).toBe("Place\nOrder")
  })

  it("does NOT set useCaseRef for FunctionRef messages", () => {
    const { ast } = parse("actor a\ncomponent b\na ->> b: IFace:fn()")
    expect(ast.messages[0].content.kind).not.toBe("useCaseRef")
    expect(ast.messages[0].content.kind).toBe("functionRef")
  })

  it("does NOT set useCaseRef for plain label messages", () => {
    const { ast } = parse("actor a\ncomponent b\na ->> b: hello world")
    expect(ast.messages[0].content.kind).not.toBe("useCaseRef")
    expect((ast.messages[0].content as { text: string }).text).toBe("hello world")
  })
})

describe("resolveUseCaseByPath", () => {
  const makeUc = (uuid: string, id: string) => ({
    uuid, id, name: id, type: "use-case" as const, sequenceDiagrams: [],
  })
  const makeUcd = (uuid: string, useCases: ReturnType<typeof makeUc>[]) => ({
    uuid, id: "ucd", name: "ucd", type: "use-case-diagram" as const,
    ownerComponentUuid: "",
    referencedNodeIds: [],
    content: "",
    useCases,
  })
  const makeCompWithUcs = (uuid: string, id: string, ucIds: string[]): ComponentNode => ({
    uuid, id, name: id, type: "component",
    actors: [], subComponents: [], interfaces: [],
    useCaseDiagrams: [makeUcd(`${uuid}-ucd`, ucIds.map((ucId) => makeUc(`${uuid}-${ucId}-uuid`, ucId)))],
  })

  it("resolves local use case (no compPath)", () => {
    const owner = makeCompWithUcs("owner-uuid", "owner", ["placeOrder"])
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const result = resolveUseCaseByPath(["placeOrder"], root, owner, "owner-uuid")
    expect(result).toBe("owner-uuid-placeOrder-uuid")
  })

  it("resolves use case in a sibling component by absolute path", () => {
    const orders = makeCompWithUcs("orders-uuid", "orders", ["placeOrder"])
    const owner = makeNamedComp("owner-uuid", "owner", "owner")
    const root = makeNamedComp("root-uuid", "root", "root", [owner, orders])
    const result = resolveUseCaseByPath(["orders", "placeOrder"], root, owner, "owner-uuid")
    expect(result).toBe("orders-uuid-placeOrder-uuid")
  })

  it("returns undefined for unknown use case id", () => {
    const owner = makeCompWithUcs("owner-uuid", "owner", ["placeOrder"])
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const result = resolveUseCaseByPath(["unknown"], root, owner, "owner-uuid")
    expect(result).toBeUndefined()
  })

  it("returns undefined for unknown component path", () => {
    const owner = makeCompWithUcs("owner-uuid", "owner", ["placeOrder"])
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const result = resolveUseCaseByPath(["nonexistent", "placeOrder"], root, owner, "owner-uuid")
    expect(result).toBeUndefined()
  })
})

describe("parseSequenceDiagram — UseCase referencedNodeIds", () => {
  it("adds local use case UUID to referencedNodeIds via direct AST inspection", () => {
    // We test via the visitor directly: parse AST and verify useCaseRef is populated,
    // then verify resolveUseCaseByPath returns the correct UUID.
    const { ast } = parse("actor customer\ncustomer ->> customer: UseCase:placeOrder")
    expect(ast.messages[0].content).toEqual({ kind: "useCaseRef", path: ["placeOrder"], label: null })

    // Verify resolver returns correct UUID
    const makeUc = (uuid: string, id: string) => ({
      uuid, id, name: id, type: "use-case" as const, sequenceDiagrams: [],
    })
    const owner: ComponentNode = {
      uuid: "owner-uuid", id: "owner", name: "owner", type: "component",
      actors: [], subComponents: [], interfaces: [],
      useCaseDiagrams: [{
        uuid: "ucd-uuid", id: "ucd", name: "ucd", type: "use-case-diagram",
        ownerComponentUuid: "owner-uuid", referencedNodeIds: [], content: "",
        useCases: [makeUc("uc-uuid", "placeOrder")],
      }],
    }
    const root: ComponentNode = {
      uuid: "root-uuid", id: "root", name: "root", type: "component",
      actors: [], subComponents: [owner], interfaces: [], useCaseDiagrams: [],
    }
    const uuid = resolveUseCaseByPath(["placeOrder"], root, owner, "owner-uuid")
    expect(uuid).toBe("uc-uuid")
  })
})

describe("parseSequenceDiagram — Sequence: referencedNodeIds", () => {
  it("adds target sequence diagram UUID to referencedNodeIds when Sequence: ref is used", () => {
    // loginFlow is the target being referenced
    const loginFlow = {
      uuid: "login-flow-uuid", id: "loginFlow", name: "Login Flow", type: "sequence-diagram" as const,
      ownerComponentUuid: "owner-uuid", referencedNodeIds: [], referencedFunctionUuids: [], content: "",
    }
    // refDiag is the diagram that contains the Sequence:loginFlow message — it already exists in the tree
    const refDiag = {
      uuid: "ref-diag-uuid", id: "refDiag", name: "Ref Diag", type: "sequence-diagram" as const,
      ownerComponentUuid: "owner-uuid", referencedNodeIds: [], referencedFunctionUuids: [], content: "",
    }
    const owner: ComponentNode = {
      uuid: "owner-uuid", id: "owner", name: "owner", type: "component",
      actors: [], subComponents: [], interfaces: [],
      useCaseDiagrams: [{
        uuid: "ucd-uuid", id: "ucd", name: "ucd", type: "use-case-diagram",
        ownerComponentUuid: "owner-uuid", referencedNodeIds: [], content: "",
        useCases: [{
          uuid: "uc-uuid", id: "login", name: "login", type: "use-case",
          sequenceDiagrams: [loginFlow, refDiag],
        }],
      }],
    }
    const root: ComponentNode = {
      uuid: "root-uuid", id: "root", name: "root", type: "component",
      actors: [], subComponents: [owner], interfaces: [], useCaseDiagrams: [],
    }

    // Parse refDiag's content — it references loginFlow via Sequence:loginFlow
    const updatedRoot = parseSequenceDiagram(
      "actor a\na ->> a: Sequence:loginFlow",
      root,
      "owner-uuid",
      "ref-diag-uuid",
    )

    const updatedDiag = updatedRoot.subComponents[0].useCaseDiagrams[0].useCases[0]
      .sequenceDiagrams.find((s) => s.uuid === "ref-diag-uuid")
    expect(updatedDiag).toBeDefined()
    expect(updatedDiag!.referencedNodeIds).toContain("login-flow-uuid")
  })
})

describe("generateSequenceMermaidFromAst — UseCaseRef messages", () => {
  const makeCompWithUcs3 = (uuid: string, id: string, ucIds: { id: string; name: string }[]): ComponentNode => ({
    uuid, id, name: id, type: "component",
    actors: [], subComponents: [], interfaces: [],
    useCaseDiagrams: [{
      uuid: `${uuid}-ucd`, id: "ucd", name: "ucd", type: "use-case-diagram",
      ownerComponentUuid: uuid, referencedNodeIds: [], content: "",
      useCases: ucIds.map((uc) => ({
        uuid: `${uuid}-${uc.id}-uuid`, id: uc.id, name: uc.name, type: "use-case", sequenceDiagrams: [],
      })),
    }],
  })

  it("renders local UseCaseRef using use case name as label", () => {
    const owner = makeCompWithUcs3("owner-uuid", "owner", [{ id: "placeOrder", name: "Place Order" }])
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const ast = parseAst("actor customer\ncustomer ->> customer: UseCase:placeOrder")
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root, "owner-uuid")
    expect(mermaidContent).toContain("customer->>customer: Place Order")
  })

  it("renders UseCaseRef with custom label overriding use case name", () => {
    const owner = makeCompWithUcs3("owner-uuid", "owner", [{ id: "placeOrder", name: "Place Order" }])
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const ast = parseAst("actor customer\ncustomer ->> customer: UseCase:placeOrder:Custom Label")
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root, "owner-uuid")
    expect(mermaidContent).toContain("customer->>customer: Custom Label")
  })

  it("falls back to ucId when use case is not in tree", () => {
    const owner = makeNamedComp("owner-uuid", "owner", "owner")
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const ast = parseAst("actor customer\ncustomer ->> customer: UseCase:unknownUc")
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root, "owner-uuid")
    expect(mermaidContent).toContain("customer->>customer: unknownUc")
  })

  it("populates messageLabelToUuid for UseCaseRef using the rendered display label as key", () => {
    const owner = makeCompWithUcs3("owner-uuid", "owner", [{ id: "placeOrder", name: "Place Order" }])
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const ast = parseAst("actor customer\ncustomer ->> customer: UseCase:placeOrder")
    const { messageLabelToUuid } = generateSequenceMermaidFromAst(ast, owner, root, "owner-uuid")
    // Key is the rendered display label (use case name), NOT the raw spec string
    expect(messageLabelToUuid["Place Order"]).toBe("owner-uuid-placeOrder-uuid")
    expect(messageLabelToUuid["UseCase:placeOrder"]).toBeUndefined()
  })
})

// ─── generateSequenceMermaidFromAst — functionRef display label ───────────────

describe("generateSequenceMermaidFromAst — functionRef display label", () => {
  const makeCompWithIface2 = (uuid: string, id: string): ComponentNode => ({
    uuid, id, name: id, type: "component",
    actors: [], subComponents: [], useCaseDiagrams: [],
    interfaces: [{ uuid: `${uuid}-iface`, id: "IFace", name: "IFace", type: "rest" as const, functions: [{ uuid: `${uuid}-fn`, id: "doWork", parameters: [] }] }],
  })

  it("uses function(paramNames) as default label when no display label suffix", () => {
    const owner = makeCompWithIface2("owner-uuid", "owner")
    const root = { uuid: "root-uuid", id: "root", name: "root", type: "component" as const, actors: [], subComponents: [owner], useCaseDiagrams: [], interfaces: [] }
    const ast = parseAst("actor caller\ncaller ->> owner: IFace:doWork()")
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("caller->>owner: doWork()")
    expect(mermaidContent).not.toContain("IFace:doWork()")
  })

  it("uses display label suffix as mermaid label when present", () => {
    const owner = makeCompWithIface2("owner-uuid", "owner")
    const root = { uuid: "root-uuid", id: "root", name: "root", type: "component" as const, actors: [], subComponents: [owner], useCaseDiagrams: [], interfaces: [] }
    const ast = parseAst("actor caller\ncaller ->> owner: IFace:doWork():process data")
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("caller->>owner: process data")
    expect(mermaidContent).not.toContain("doWork()")
  })

  it("converts \\n in function ref display label to <br/> in mermaid output", () => {
    const owner = makeCompWithIface2("owner-uuid", "owner")
    const root = { uuid: "root-uuid", id: "root", name: "root", type: "component" as const, actors: [], subComponents: [owner], useCaseDiagrams: [], interfaces: [] }
    const ast = parseAst("actor caller\ncaller ->> owner: IFace:doWork():Line1\\nLine2")
    const { mermaidContent, messageLabelToUuid } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("caller->>owner: Line1<br/>Line2")
    // Navigation key uses the clean label (with newline char, not <br/>) to match SVG textContent
    expect(messageLabelToUuid["Line1\nLine2"]).toBeDefined()
  })

  it("populates messageLabelToUuid using the display label as key when present", () => {
    const owner = makeCompWithIface2("owner-uuid", "owner")
    const root = { uuid: "root-uuid", id: "root", name: "root", type: "component" as const, actors: [], subComponents: [owner], useCaseDiagrams: [], interfaces: [] }
    const ast = parseAst("actor caller\ncaller ->> owner: IFace:doWork():custom label")
    const { messageLabelToUuid } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(messageLabelToUuid["custom label"]).toBeDefined()
    expect(messageLabelToUuid["doWork()"]).toBeUndefined()
    expect(messageLabelToUuid["IFace:doWork()"]).toBeUndefined()
  })

  it("falls back to function(paramNames) when trailing colon produces empty label", () => {
    const owner = makeCompWithIface2("owner-uuid", "owner")
    const root = { uuid: "root-uuid", id: "root", name: "root", type: "component" as const, actors: [], subComponents: [owner], useCaseDiagrams: [], interfaces: [] }
    const ast = parseAst("actor caller\ncaller ->> owner: IFace:doWork():")
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("caller->>owner: doWork()")
  })

  it("does not append suffix when the same function is called multiple times", () => {
    const owner = makeCompWithIface2("owner-uuid", "owner")
    const root = { uuid: "root-uuid", id: "root", name: "root", type: "component" as const, actors: [], subComponents: [owner], useCaseDiagrams: [], interfaces: [] }
    const ast = parseAst("actor caller\ncaller ->> owner: IFace:doWork()\ncaller ->> owner: IFace:doWork()\ncaller ->> owner: IFace:doWork()")
    const { mermaidContent, messageLabelToUuid } = generateSequenceMermaidFromAst(ast, owner, root)
    // All three calls are the same function → no suffix on any of them
    expect(mermaidContent.match(/caller->>owner: doWork\(\)/g)?.length).toBe(3)
    expect(mermaidContent).not.toContain("doWork() (2)")
    expect(mermaidContent).not.toContain("doWork() (3)")
    expect(messageLabelToUuid["doWork()"]).toBeDefined()
  })

  it("appends (n) suffix when different functions produce the same base label", () => {
    // Two interfaces on the same component both have a function named "process"
    const owner: ComponentNode = {
      uuid: "owner-uuid", id: "owner", name: "owner", type: "component",
      actors: [], subComponents: [], useCaseDiagrams: [],
      interfaces: [
        { uuid: "iface1-uuid", id: "IFace1", name: "IFace1", type: "rest" as const, functions: [{ uuid: "fn1-uuid", id: "process", parameters: [] }] },
        { uuid: "iface2-uuid", id: "IFace2", name: "IFace2", type: "rest" as const, functions: [{ uuid: "fn2-uuid", id: "process", parameters: [] }] },
      ],
    }
    const root = { uuid: "root-uuid", id: "root", name: "root", type: "component" as const, actors: [], subComponents: [owner], useCaseDiagrams: [], interfaces: [] }
    const ast = parseAst("actor caller\ncaller ->> owner: IFace1:process()\ncaller ->> owner: IFace2:process()")
    const { mermaidContent, messageLabelToUuid } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("caller->>owner: process()")
    expect(mermaidContent).toContain("caller->>owner: process() (2)")
    expect(messageLabelToUuid["process()"]).toBeDefined()
    expect(messageLabelToUuid["process() (2)"]).toBeDefined()
  })

  it("appends (n) suffix when same function is called on different receivers", () => {
    // Two components each have their own IFace interface with the same function
    const compA: ComponentNode = {
      uuid: "compa-uuid", id: "compA", name: "compA", type: "component",
      actors: [], subComponents: [], useCaseDiagrams: [],
      interfaces: [{ uuid: "ifaceA-uuid", id: "IFace", name: "IFace", type: "rest" as const, functions: [{ uuid: "fnA-uuid", id: "doWork", parameters: [] }] }],
    }
    const compB: ComponentNode = {
      uuid: "compb-uuid", id: "compB", name: "compB", type: "component",
      actors: [], subComponents: [], useCaseDiagrams: [],
      interfaces: [{ uuid: "ifaceB-uuid", id: "IFace", name: "IFace", type: "rest" as const, functions: [{ uuid: "fnB-uuid", id: "doWork", parameters: [] }] }],
    }
    const root = { uuid: "root-uuid", id: "root", name: "root", type: "component" as const, actors: [], subComponents: [compA, compB], useCaseDiagrams: [], interfaces: [] }
    const ast = parseAst("actor caller\ncaller ->> compA: IFace:doWork()\ncaller ->> compB: IFace:doWork()")
    const { mermaidContent, messageLabelToUuid } = generateSequenceMermaidFromAst(ast, root, root)
    expect(mermaidContent).toContain("caller->>compA: doWork()")
    expect(mermaidContent).toContain("caller->>compB: doWork() (2)")
    expect(messageLabelToUuid["doWork()"]).toBeDefined()
    expect(messageLabelToUuid["doWork() (2)"]).toBeDefined()
  })

  it("includes param names in default label", () => {
    const owner = makeCompWithIface2("owner-uuid", "owner")
    const root = { uuid: "root-uuid", id: "root", name: "root", type: "component" as const, actors: [], subComponents: [owner], useCaseDiagrams: [], interfaces: [] }
    const ast = parseAst("actor caller\ncaller ->> owner: IFace:doWork(userId: string, count: integer?)")
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("caller->>owner: doWork(userId, count)")
  })

  it("populates messageLabelToInterfaceUuid with the interface uuid", () => {
    const owner = makeCompWithIface2("owner-uuid", "owner")
    const root = { uuid: "root-uuid", id: "root", name: "root", type: "component" as const, actors: [], subComponents: [owner], useCaseDiagrams: [], interfaces: [] }
    const ast = parseAst("actor caller\ncaller ->> owner: IFace:doWork()")
    const { messageLabelToInterfaceUuid } = generateSequenceMermaidFromAst(ast, owner, root)
    // "owner-uuid-iface" is the iface uuid from makeCompWithIface2
    expect(messageLabelToInterfaceUuid["doWork()"]).toBe("owner-uuid-iface")
  })

  it("does not populate messageLabelToInterfaceUuid for unresolved interface", () => {
    const owner = makeCompWithIface2("owner-uuid", "owner")
    const root = { uuid: "root-uuid", id: "root", name: "root", type: "component" as const, actors: [], subComponents: [owner], useCaseDiagrams: [], interfaces: [] }
    const ast = parseAst("actor caller\ncaller ->> owner: IUnknown:doWork()")
    const { messageLabelToInterfaceUuid } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(messageLabelToInterfaceUuid["doWork()"]).toBeUndefined()
  })
})

// ─── parseSequenceDiagram — function-follows-receiver ────────────────────────

const makeCompWithIface = (
  uuid: string,
  id: string,
  subComponents: ComponentNode[] = [],
  ifaceId?: string,
  fnId?: string,
  fnUuid?: string,
): ComponentNode => {
  const interfaces = ifaceId && fnId && fnUuid
    ? [{ uuid: `${uuid}-iface`, id: ifaceId, name: ifaceId, type: "rest" as const, functions: [{ uuid: fnUuid, id: fnId, parameters: [] }] }]
    : []
  return { uuid, id, name: id, type: "component", actors: [], subComponents, useCaseDiagrams: [], interfaces }
}

describe("parseSequenceDiagram — function follows receiver", () => {
  it("adds function to new local receiver when receiver changes", () => {
    // owner has two subComponents: ServiceB (has getUser) and ServiceC (empty)
    const serviceB = makeCompWithIface("sb-uuid", "ServiceB", [], "REST", "getUser", "fn-uuid-1")
    const serviceC = makeCompWithIface("sc-uuid", "ServiceC")
    const owner = makeComp("owner-uuid", "owner", [serviceB, serviceC])
    const root = makeComp("root-uuid", "root", [owner])

    // Spec where ServiceC is now the receiver
    const result = parseSequenceDiagram(
      "component ServiceB\ncomponent ServiceC\nServiceB ->> ServiceC: REST:getUser()",
      root,
      owner.uuid,
      "diag-uuid",
    )

    const updatedOwner = result.subComponents.find((c) => c.uuid === owner.uuid)!
    const updatedC = updatedOwner.subComponents.find((c) => c.id === "ServiceC")!
    const cFn = updatedC.interfaces.find((i) => i.id === "REST")?.functions.find((f) => f.id === "getUser")
    expect(cFn).toBeDefined()
  })

  it("adds function to external (path) participant at the correct leaf component", () => {
    // Tree: root → owner → payment → ServiceB
    const serviceB = makeCompWithIface("sb-uuid", "ServiceB")
    const payment = makeComp("pay-uuid", "payment", [serviceB])
    const owner = makeComp("owner-uuid", "owner", [payment])
    const root = makeComp("root-uuid", "root", [owner])

    // "ServiceB" is declared with path payment/ServiceB; message references it by its id "ServiceB"
    const spec = "component payment/ServiceB\ncomponent gateway\ngateway ->> ServiceB: REST:getUser()"
    const result = parseSequenceDiagram(spec, root, owner.uuid, "diag-uuid")

    const updatedOwner = result.subComponents.find((c) => c.uuid === owner.uuid)!
    const updatedPayment = updatedOwner.subComponents.find((c) => c.id === "payment")!
    const updatedServiceB = updatedPayment.subComponents.find((c) => c.id === "ServiceB")!
    const fn = updatedServiceB.interfaces.find((i) => i.id === "REST")?.functions.find((f) => f.id === "getUser")
    expect(fn).toBeDefined()
  })

  it("referencedFunctionUuids points to the function on the leaf external component", () => {
    const serviceB = makeCompWithIface("sb-uuid", "ServiceB")
    const payment = makeComp("pay-uuid", "payment", [serviceB])
    const owner = makeComp("owner-uuid", "owner", [payment])
    const root = makeComp("root-uuid", "root", [owner])

    // "ServiceB" is declared with path payment/ServiceB; message references by id "ServiceB"
    const spec = "component payment/ServiceB\ncomponent gateway\ngateway ->> ServiceB: REST:getUser()"
    const result = parseSequenceDiagram(spec, root, owner.uuid, "diag-uuid")

    // Locate the function UUID on ServiceB (leaf)
    const updatedOwner = result.subComponents.find((c) => c.uuid === owner.uuid)!
    const updatedPayment = updatedOwner.subComponents.find((c) => c.id === "payment")!
    const updatedServiceB = updatedPayment.subComponents.find((c) => c.id === "ServiceB")!
    const fn = updatedServiceB.interfaces.find((i) => i.id === "REST")?.functions.find((f) => f.id === "getUser")
    expect(fn).toBeDefined()
    // Function must NOT be on the parent "payment" component
    const paymentFn = updatedPayment.interfaces.find((i) => i.id === "REST")?.functions.find((f) => f.id === "getUser")
    expect(paymentFn).toBeUndefined()
  })
})

// ─── Block constructs (loop / alt / par) ─────────────────────────────────────

import { renameInSeqSpec } from "./specSerializer"

function parseBlock(input: string): SeqBlock {
  const { cst } = parseSequenceDiagramCst(input)
  const ast = buildSeqAst(cst)
  const block = ast.statements.find((s): s is SeqBlock => "sections" in s)
  if (!block) throw new Error("no SeqBlock found in AST")
  return block
}

describe("sequence diagram block constructs — visitor", () => {
  it("parses a loop block with condition text", () => {
    const block = parseBlock("actor A\nactor B\nloop check every second\n  A ->> B: ping\nend")
    expect(block.kind).toBe("loop")
    expect(block.sections).toHaveLength(1)
    expect(block.sections[0].guard).toBe("check every second")
    const msg = block.sections[0].statements[0] as SeqMessage
    expect(msg.from).toBe("A")
    expect(msg.to).toBe("B")
  })

  it("parses a loop block without condition text", () => {
    const block = parseBlock("actor A\nactor B\nloop\n  A ->> B: ping\nend")
    expect(block.kind).toBe("loop")
    expect(block.sections[0].guard).toBeNull()
  })

  it("parses an alt block with multiple else branches", () => {
    const block = parseBlock(
      "actor A\nactor B\nalt happy path\n  A ->> B: ok\nelse error\n  A ->> B: err\nelse\n  A ->> B: default\nend"
    )
    expect(block.kind).toBe("alt")
    expect(block.sections).toHaveLength(3)
    expect(block.sections[0].guard).toBe("happy path")
    expect(block.sections[1].guard).toBe("error")
    expect(block.sections[2].guard).toBeNull()
    expect(((block.sections[0].statements[0] as SeqMessage).content as { text: string }).text).toBe("ok")
    expect(((block.sections[1].statements[0] as SeqMessage).content as { text: string }).text).toBe("err")
    expect(((block.sections[2].statements[0] as SeqMessage).content as { text: string }).text).toBe("default")
  })

  it("parses a par block with and sections", () => {
    const block = parseBlock(
      "actor A\nactor B\nactor C\nactor D\npar group 1\n  A ->> B: msg1\nand group 2\n  C ->> D: msg2\nend"
    )
    expect(block.kind).toBe("par")
    expect(block.sections).toHaveLength(2)
    expect(block.sections[0].guard).toBe("group 1")
    expect(block.sections[1].guard).toBe("group 2")
  })

  it("parses nested blocks (loop inside alt)", () => {
    const spec = "actor A\nactor B\nalt outer\n  loop inner\n    A ->> B: ping\n  end\nend"
    const { cst } = parseSequenceDiagramCst(spec)
    const ast = buildSeqAst(cst)
    const outer = ast.statements.find((s): s is SeqBlock => "sections" in s)!
    expect(outer.kind).toBe("alt")
    const inner = outer.sections[0].statements.find((s): s is SeqBlock => "sections" in s)!
    expect(inner.kind).toBe("loop")
    expect((inner.sections[0].statements[0] as SeqMessage).from).toBe("A")
  })
})

describe("sequence diagram block constructs — mermaid generator", () => {
  const mkComp = (uuid: string, id: string): ComponentNode => ({
    uuid, id, name: id, type: "component",
    actors: [], subComponents: [], useCaseDiagrams: [], interfaces: [],
  })

  it("emits loop block in mermaid output", () => {
    const spec = "actor A\nactor B\nloop check\n  A ->> B: ping\nend"
    const { cst } = parseSequenceDiagramCst(spec)
    const ast = buildSeqAst(cst)
    const owner = mkComp("o", "owner")
    const root = mkComp("r", "root")
    root.subComponents = [owner]
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("loop check")
    expect(mermaidContent).toContain("end")
    expect(mermaidContent).toContain("A->>B: ping")
  })

  it("emits alt/else/end in mermaid output", () => {
    const spec = "actor A\nactor B\nalt good\n  A ->> B: ok\nelse bad\n  A ->> B: err\nend"
    const { cst } = parseSequenceDiagramCst(spec)
    const ast = buildSeqAst(cst)
    const owner = mkComp("o", "owner")
    const root = mkComp("r", "root")
    root.subComponents = [owner]
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("alt good")
    expect(mermaidContent).toContain("else bad")
    expect(mermaidContent).toContain("end")
  })

  it("emits par/and/end in mermaid output", () => {
    const spec = "actor A\nactor B\nactor C\nactor D\npar g1\n  A ->> B: m1\nand g2\n  C ->> D: m2\nend"
    const { cst } = parseSequenceDiagramCst(spec)
    const ast = buildSeqAst(cst)
    const owner = mkComp("o", "owner")
    const root = mkComp("r", "root")
    root.subComponents = [owner]
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("par g1")
    expect(mermaidContent).toContain("and g2")
    expect(mermaidContent).toContain("end")
  })

  it("auto-declares participants referenced only inside a block", () => {
    const spec = "actor A\nloop\n  A ->> B: msg\nend"
    const { cst } = parseSequenceDiagramCst(spec)
    const ast = buildSeqAst(cst)
    const owner = mkComp("o", "owner")
    const root = mkComp("r", "root")
    root.subComponents = [owner]
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    // B is not declared but should appear as a participant
    expect(mermaidContent).toContain("B")
  })
})

describe("sequence diagram block constructs — spec serializer", () => {
  it("round-trips a loop block", () => {
    const { cst } = parseSequenceDiagramCst("actor A\nactor B\nloop check\n  A ->> B: ping\nend")
    const ast = buildSeqAst(cst)
    const spec = seqAstToSpec(ast)
    expect(spec).toContain("loop check")
    expect(spec).toContain("end")
    expect(spec).toContain("A ->> B: ping")
  })

  it("round-trips an alt block with else branches", () => {
    const input = "actor A\nactor B\nalt good\n  A ->> B: ok\nelse bad\n  A ->> B: err\nend"
    const { cst } = parseSequenceDiagramCst(input)
    const ast = buildSeqAst(cst)
    const spec = seqAstToSpec(ast)
    expect(spec).toContain("alt good")
    expect(spec).toContain("else bad")
    expect(spec).toContain("end")
  })

  it("renames participant ID inside a block", () => {
    const input = "actor A\nactor B\nloop\n  A ->> B: ping\nend"
    const renamed = renameInSeqSpec(input, "A", "Alpha")
    expect(renamed).toContain("actor Alpha")
    expect(renamed).toContain("Alpha ->> B: ping")
    expect(renamed).not.toContain("A ->>")
  })

  it("renames participant ID inside nested blocks", () => {
    const input = "actor A\nactor B\nalt outer\n  loop inner\n    A ->> B: ping\n  end\nend"
    const renamed = renameInSeqSpec(input, "B", "Beta")
    expect(renamed).toContain("actor Beta")
    expect(renamed).toContain("A ->> Beta: ping")
    expect(renamed).not.toContain("->> B:")
  })
})

describe("sequence diagram block constructs — system updater", () => {
  const mkComp2 = (uuid: string, id: string, subs: ComponentNode[] = []): ComponentNode => ({
    uuid, id, name: id, type: "component",
    actors: [], subComponents: subs, useCaseDiagrams: [], interfaces: [],
  })

  it("derives interface spec from messages inside a loop block", () => {
    const child = mkComp2("child-uuid", "svc")
    const owner = mkComp2("owner-uuid", "owner", [child])
    const root = mkComp2("root-uuid", "root", [owner])
    const spec = "component svc\nactor caller\nloop retry\n  caller ->> svc: IFace:fn()\nend"
    const result = parseSequenceDiagram(spec, root, owner.uuid, "diag-uuid")
    const updatedOwner = result.subComponents.find((c) => c.uuid === owner.uuid)!
    const updatedSvc = updatedOwner.subComponents.find((c) => c.id === "svc")!
    const fn = updatedSvc.interfaces.find((i) => i.id === "IFace")?.functions.find((f) => f.id === "fn")
    expect(fn).toBeDefined()
  })

  it("derives interface spec from messages inside nested blocks", () => {
    const child = mkComp2("child-uuid", "svc")
    const owner = mkComp2("owner-uuid", "owner", [child])
    const root = mkComp2("root-uuid", "root", [owner])
    const spec = "component svc\nactor caller\nalt branch\n  loop retry\n    caller ->> svc: IFace:doWork()\n  end\nend"
    const result = parseSequenceDiagram(spec, root, owner.uuid, "diag-uuid")
    const updatedOwner = result.subComponents.find((c) => c.uuid === owner.uuid)!
    const updatedSvc = updatedOwner.subComponents.find((c) => c.id === "svc")!
    const fn = updatedSvc.interfaces.find((i) => i.id === "IFace")?.functions.find((f) => f.id === "doWork")
    expect(fn).toBeDefined()
  })
})

// ─── opt block construct ──────────────────────────────────────────────────────

describe("sequence diagram opt block — visitor", () => {
  it("parses an opt block with condition text", () => {
    const block = parseBlock("actor A\nactor B\nopt if premium user\n  A ->> B: upgrade\nend")
    expect(block.kind).toBe("opt")
    expect(block.sections).toHaveLength(1)
    expect(block.sections[0].guard).toBe("if premium user")
    const msg = block.sections[0].statements[0] as SeqMessage
    expect(msg.from).toBe("A")
    expect(msg.to).toBe("B")
    expect((msg.content as { text: string }).text).toBe("upgrade")
  })

  it("parses an opt block without condition text", () => {
    const block = parseBlock("actor A\nactor B\nopt\n  A ->> B: ping\nend")
    expect(block.kind).toBe("opt")
    expect(block.sections[0].guard).toBeNull()
  })

  it("parses opt nested inside alt", () => {
    const spec = "actor A\nactor B\nalt outer\n  opt inner\n    A ->> B: ping\n  end\nend"
    const { cst } = parseSequenceDiagramCst(spec)
    const ast = buildSeqAst(cst)
    const outer = ast.statements.find((s): s is SeqBlock => "sections" in s)!
    expect(outer.kind).toBe("alt")
    const inner = outer.sections[0].statements.find((s): s is SeqBlock => "sections" in s)!
    expect(inner.kind).toBe("opt")
  })
})

describe("sequence diagram opt block — mermaid generator", () => {
  const mkOptComp = (uuid: string, id: string): ComponentNode => ({
    uuid, id, name: id, type: "component",
    actors: [], subComponents: [], useCaseDiagrams: [], interfaces: [],
  })

  it("emits opt block in mermaid output", () => {
    const spec = "actor A\nactor B\nopt if premium\n  A ->> B: upgrade\nend"
    const { cst } = parseSequenceDiagramCst(spec)
    const ast = buildSeqAst(cst)
    const owner = mkOptComp("o", "owner")
    const root = mkOptComp("r", "root")
    root.subComponents = [owner]
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("opt if premium")
    expect(mermaidContent).toContain("end")
    expect(mermaidContent).not.toContain("else")
    expect(mermaidContent).not.toContain("and")
  })
})

describe("sequence diagram opt block — spec serializer", () => {
  it("round-trips an opt block", () => {
    const { cst } = parseSequenceDiagramCst("actor A\nactor B\nopt condition\n  A ->> B: ping\nend")
    const ast = buildSeqAst(cst)
    const spec = seqAstToSpec(ast)
    expect(spec).toContain("opt condition")
    expect(spec).toContain("end")
    expect(spec).toContain("A ->> B: ping")
  })

  it("renames participant ID inside an opt block", () => {
    const input = "actor A\nactor B\nopt\n  A ->> B: ping\nend"
    const renamed = renameInSeqSpec(input, "A", "Alpha")
    expect(renamed).toContain("actor Alpha")
    expect(renamed).toContain("Alpha ->> B: ping")
    expect(renamed).not.toContain("A ->>")
  })
})

// ─── SequenceRef token ─────────────────────────────────────────────────────────

import { SequenceRef } from "./lexer"
import { resolveSeqDiagramByPath } from "../../utils/diagramResolvers"

describe("SequenceRef — lexer", () => {
  it("tokenises local Sequence reference (no slash)", () => {
    const result = SeqLexer.tokenize("actor sender\nsender ->> receiver: Sequence:loginFlow")
    const toks = result.tokens.filter((t) => t.tokenType === SequenceRef)
    expect(toks).toHaveLength(1)
    expect(toks[0].image).toBe("Sequence:loginFlow")
  })

  it("tokenises path Sequence reference (with slashes)", () => {
    const result = SeqLexer.tokenize("actor sender\nsender ->> receiver: Sequence:auth/loginFlow")
    const toks = result.tokens.filter((t) => t.tokenType === SequenceRef)
    expect(toks).toHaveLength(1)
    expect(toks[0].image).toBe("Sequence:auth/loginFlow")
  })

  it("tokenises Sequence reference with custom label", () => {
    const result = SeqLexer.tokenize("actor sender\nsender ->> receiver: Sequence:loginFlow:Log In")
    const toks = result.tokens.filter((t) => t.tokenType === SequenceRef)
    expect(toks).toHaveLength(1)
    expect(toks[0].image).toBe("Sequence:loginFlow:Log In")
  })

  it("does NOT tokenise plain labels as SequenceRef", () => {
    const result = SeqLexer.tokenize("actor sender\nsender ->> receiver: some plain label")
    const toks = result.tokens.filter((t) => t.tokenType === SequenceRef)
    expect(toks).toHaveLength(0)
  })
})

describe("SequenceRef — visitor (SeqMessage.seqDiagramRef)", () => {
  it("populates seqDiagramRef for local reference", () => {
    const { ast } = parse("actor a\ncomponent b\na ->> b: Sequence:loginFlow")
    expect(ast.messages[0].content).toEqual({ kind: "seqDiagramRef", path: ["loginFlow"], label: null })
    expect(ast.messages[0].content.kind).not.toBe("functionRef")
    expect(ast.messages[0].content.kind).not.toBe("useCaseRef")
    expect(ast.messages[0].content.kind).not.toBe("label")
  })

  it("populates seqDiagramRef for path reference", () => {
    const { ast } = parse("actor a\ncomponent b\na ->> b: Sequence:auth/loginFlow")
    expect(ast.messages[0].content).toEqual({ kind: "seqDiagramRef", path: ["auth", "loginFlow"], label: null })
  })

  it("populates seqDiagramRef with custom label", () => {
    const { ast } = parse("actor a\ncomponent b\na ->> b: Sequence:loginFlow:Log In")
    expect(ast.messages[0].content).toEqual({ kind: "seqDiagramRef", path: ["loginFlow"], label: "Log In" })
  })

  it("does NOT set seqDiagramRef for FunctionRef messages", () => {
    const { ast } = parse("actor a\ncomponent b\na ->> b: IFace:fn()")
    expect(ast.messages[0].content.kind).not.toBe("seqDiagramRef")
  })

  it("does NOT set seqDiagramRef for UseCaseRef messages", () => {
    const { ast } = parse("actor a\ncomponent b\na ->> b: UseCase:placeOrder")
    expect(ast.messages[0].content.kind).not.toBe("seqDiagramRef")
    expect(ast.messages[0].content.kind).toBe("useCaseRef")
  })

  it("does NOT set seqDiagramRef for plain label messages", () => {
    const { ast } = parse("actor a\ncomponent b\na ->> b: hello world")
    expect(ast.messages[0].content.kind).not.toBe("seqDiagramRef")
  })
})

describe("resolveSeqDiagramByPath", () => {
  const makeSeq = (uuid: string, id: string, name = id) => ({
    uuid, id, name, type: "sequence-diagram" as const,
    ownerComponentUuid: "", referencedNodeIds: [], referencedFunctionUuids: [], content: "",
  })
  const makeUc = (uuid: string, id: string, seqIds: { id: string; name?: string }[]) => ({
    uuid, id, name: id, type: "use-case" as const,
    sequenceDiagrams: seqIds.map((s) => makeSeq(`${uuid}-${s.id}-uuid`, s.id, s.name ?? s.id)),
  })
  const makeUcd = (uuid: string, ucs: ReturnType<typeof makeUc>[]) => ({
    uuid, id: "ucd", name: "ucd", type: "use-case-diagram" as const,
    ownerComponentUuid: "", referencedNodeIds: [], content: "",
    useCases: ucs,
  })
  const makeCompWithSeqs = (uuid: string, id: string, seqIds: { id: string; name?: string }[]): ComponentNode => ({
    uuid, id, name: id, type: "component",
    actors: [], subComponents: [], interfaces: [],
    useCaseDiagrams: [makeUcd(`${uuid}-ucd`, [makeUc(`${uuid}-uc`, "uc", seqIds)])],
  })

  it("resolves local sequence diagram (no compPath)", () => {
    const owner = makeCompWithSeqs("owner-uuid", "owner", [{ id: "loginFlow" }])
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const result = resolveSeqDiagramByPath(["loginFlow"], root, owner, "owner-uuid")
    expect(result).toBe("owner-uuid-uc-loginFlow-uuid")
  })

  it("resolves sequence diagram in a sibling component by absolute path", () => {
    const auth = makeCompWithSeqs("auth-uuid", "auth", [{ id: "loginFlow" }])
    const owner = makeNamedComp("owner-uuid", "owner", "owner")
    const root = makeNamedComp("root-uuid", "root", "root", [owner, auth])
    const result = resolveSeqDiagramByPath(["auth", "loginFlow"], root, owner, "owner-uuid")
    expect(result).toBe("auth-uuid-uc-loginFlow-uuid")
  })

  it("returns undefined for unknown sequence diagram id", () => {
    const owner = makeCompWithSeqs("owner-uuid", "owner", [{ id: "loginFlow" }])
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const result = resolveSeqDiagramByPath(["unknown"], root, owner, "owner-uuid")
    expect(result).toBeUndefined()
  })

  it("returns undefined for unknown component path", () => {
    const owner = makeCompWithSeqs("owner-uuid", "owner", [{ id: "loginFlow" }])
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const result = resolveSeqDiagramByPath(["nonexistent", "loginFlow"], root, owner, "owner-uuid")
    expect(result).toBeUndefined()
  })
})

describe("generateSequenceMermaidFromAst — SequenceRef messages", () => {
  const makeCompWithSeqs2 = (uuid: string, id: string, seqs: { id: string; name: string }[]): ComponentNode => ({
    uuid, id, name: id, type: "component",
    actors: [], subComponents: [], interfaces: [],
    useCaseDiagrams: [{
      uuid: `${uuid}-ucd`, id: "ucd", name: "ucd", type: "use-case-diagram",
      ownerComponentUuid: uuid, referencedNodeIds: [], content: "",
      useCases: [{
        uuid: `${uuid}-uc`, id: "uc", name: "uc", type: "use-case",
        sequenceDiagrams: seqs.map((s) => ({
          uuid: `${uuid}-uc-${s.id}-uuid`, id: s.id, name: s.name, type: "sequence-diagram" as const,
          ownerComponentUuid: uuid, referencedNodeIds: [], referencedFunctionUuids: [], content: "",
        })),
      }],
    }],
  })

  it("renders local SequenceRef using sequence diagram name as label", () => {
    const owner = makeCompWithSeqs2("owner-uuid", "owner", [{ id: "loginFlow", name: "Login Flow" }])
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const ast = parseAst("actor customer\ncustomer ->> customer: Sequence:loginFlow")
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root, "owner-uuid")
    expect(mermaidContent).toContain("customer->>customer: Login Flow")
  })

  it("renders SequenceRef with custom label overriding sequence diagram name", () => {
    const owner = makeCompWithSeqs2("owner-uuid", "owner", [{ id: "loginFlow", name: "Login Flow" }])
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const ast = parseAst("actor customer\ncustomer ->> customer: Sequence:loginFlow:Custom Label")
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root, "owner-uuid")
    expect(mermaidContent).toContain("customer->>customer: Custom Label")
  })

  it("falls back to seqId when sequence diagram is not in tree", () => {
    const owner = makeNamedComp("owner-uuid", "owner", "owner")
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const ast = parseAst("actor customer\ncustomer ->> customer: Sequence:unknownSeq")
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root, "owner-uuid")
    expect(mermaidContent).toContain("customer->>customer: unknownSeq")
  })

  it("populates messageLabelToUuid for SequenceRef using the rendered display label as key", () => {
    const owner = makeCompWithSeqs2("owner-uuid", "owner", [{ id: "loginFlow", name: "Login Flow" }])
    const root = makeNamedComp("root-uuid", "root", "root", [owner])
    const ast = parseAst("actor customer\ncustomer ->> customer: Sequence:loginFlow")
    const { messageLabelToUuid } = generateSequenceMermaidFromAst(ast, owner, root, "owner-uuid")
    expect(messageLabelToUuid["Login Flow"]).toBe("owner-uuid-uc-loginFlow-uuid")
    expect(messageLabelToUuid["Sequence:loginFlow"]).toBeUndefined()
  })
})

// ─── Comment lines in mermaid output ─────────────────────────────────────────

describe("sequence diagram comment lines — mermaid generator", () => {
  const owner = { uuid: "o", id: "owner", name: "owner", type: "component" as const,
    actors: [], subComponents: [], useCaseDiagrams: [], interfaces: [] }
  const root = { ...owner, uuid: "r", id: "root", subComponents: [owner] }

  // Regression test for bug: comment line (#) caused "invalid diagram syntax"
  it("generates valid mermaid when spec contains a top-level comment line", () => {
    const { cst } = parseSequenceDiagramCst("actor a\nactor b\n# a comment\na ->> b: hello")
    const ast = buildSeqAst(cst)
    expect(() => generateSequenceMermaidFromAst(ast, owner, root)).not.toThrow()
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("a->>b: hello")
    expect(mermaidContent).not.toContain("undefined")
  })

  it("generates valid mermaid when comment appears between messages", () => {
    const { cst } = parseSequenceDiagramCst("actor a\nactor b\na ->> b: first\n# mid comment\na ->> b: second")
    const ast = buildSeqAst(cst)
    expect(() => generateSequenceMermaidFromAst(ast, owner, root)).not.toThrow()
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("a->>b: first")
    expect(mermaidContent).toContain("a->>b: second")
    expect(mermaidContent).not.toContain("undefined")
  })
})

// ─── activate / deactivate support ───────────────────────────────────────────

import type { SeqActivation } from "./visitor"

describe("sequence diagram activate/deactivate — lexer", () => {
  it("tokenises 'activate user' with Activate token", () => {
    const { errors, tokens } = SeqLexer.tokenize("activate user")
    expect(errors).toHaveLength(0)
    const names = tokens.map((t) => t.tokenType.name)
    expect(names).toContain("Activate")
  })

  it("tokenises 'deactivate user' with Deactivate token", () => {
    const { errors, tokens } = SeqLexer.tokenize("deactivate user")
    expect(errors).toHaveLength(0)
    const names = tokens.map((t) => t.tokenType.name)
    expect(names).toContain("Deactivate")
  })

  it("does not treat 'activateUser' as Activate keyword (no word-boundary leak)", () => {
    const { errors, tokens } = SeqLexer.tokenize("activateUser ->> b: msg")
    expect(errors).toHaveLength(0)
    const names = tokens.map((t) => t.tokenType.name)
    expect(names).not.toContain("Activate")
  })

  it("does not treat 'deactivateUser' as Deactivate keyword", () => {
    const { errors, tokens } = SeqLexer.tokenize("deactivateUser ->> b: msg")
    expect(errors).toHaveLength(0)
    const names = tokens.map((t) => t.tokenType.name)
    expect(names).not.toContain("Deactivate")
  })
})

describe("sequence diagram activate/deactivate — visitor", () => {
  it("parses 'activate p' as SeqActivation with action activate", () => {
    const { cst } = parseSequenceDiagramCst("actor p\nactivate p")
    const ast = buildSeqAst(cst)
    const activations = ast.statements.filter((s): s is SeqActivation => "action" in s)
    expect(activations).toHaveLength(1)
    expect(activations[0]).toMatchObject<SeqActivation>({ action: "activate", participant: "p" })
  })

  it("parses 'deactivate p' as SeqActivation with action deactivate", () => {
    const { cst } = parseSequenceDiagramCst("actor p\ndeactivate p")
    const ast = buildSeqAst(cst)
    const activations = ast.statements.filter((s): s is SeqActivation => "action" in s)
    expect(activations).toHaveLength(1)
    expect(activations[0]).toMatchObject<SeqActivation>({ action: "deactivate", participant: "p" })
  })

  it("parses activate followed by message then deactivate", () => {
    const spec = "actor a\nactor b\nactivate a\na ->> b: hello\ndeactivate a"
    const { cst } = parseSequenceDiagramCst(spec)
    const ast = buildSeqAst(cst)
    const activations = ast.statements.filter((s): s is SeqActivation => "action" in s)
    expect(activations).toHaveLength(2)
    expect(activations[0].action).toBe("activate")
    expect(activations[1].action).toBe("deactivate")
  })

  it("activation nodes have no 'content' field (so flattenMessages excludes them)", () => {
    const { cst } = parseSequenceDiagramCst("actor p\nactivate p\ndeactivate p")
    const ast = buildSeqAst(cst)
    const activations = ast.statements.filter((s): s is SeqActivation => "action" in s)
    expect(activations).toHaveLength(2)
    activations.forEach((s) => expect("content" in s).toBe(false))
  })
})

describe("sequence diagram activate/deactivate — mermaid generator", () => {
  const owner = makeNamedComp("owner-uuid", "owner", "owner")
  const root = makeNamedComp("root-uuid", "root", "root", [owner])

  it("emits 'activate <id>' in mermaid output", () => {
    const { cst } = parseSequenceDiagramCst("actor user\nactivate user")
    const ast = buildSeqAst(cst)
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("activate user")
  })

  it("emits 'deactivate <id>' in mermaid output", () => {
    const { cst } = parseSequenceDiagramCst("actor user\ndeactivate user")
    const ast = buildSeqAst(cst)
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("deactivate user")
  })

  it("emits activate/deactivate around a message inside a block", () => {
    const spec = "actor a\nactor b\nloop retry\n  activate a\n  a ->> b: go\n  deactivate a\nend"
    const { cst } = parseSequenceDiagramCst(spec)
    const ast = buildSeqAst(cst)
    const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain("activate a")
    expect(mermaidContent).toContain("deactivate a")
    expect(mermaidContent).toContain("a->>b: go")
  })
})
