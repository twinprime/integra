/**
 * Tests for the use case diagram Chevrotain lexer, parser, and visitor.
 */
import { describe, it, expect } from "vitest"
import { UcdLexer } from "./lexer"
import { parseUseCaseDiagramCst } from "./parser"
import { buildUcdAst } from "./visitor"

function parse(input: string) {
  const { cst, lexErrors, parseErrors } = parseUseCaseDiagramCst(input)
  return { ast: buildUcdAst(cst), lexErrors, parseErrors }
}

// ─── Lexer ────────────────────────────────────────────────────────────────────

describe("use case diagram lexer", () => {
  it("tokenises an actor declaration", () => {
    const { errors, tokens } = UcdLexer.tokenize("actor user")
    expect(errors).toHaveLength(0)
    expect(tokens.map((t) => t.tokenType.name)).toEqual(["Actor", "Identifier"])
  })

  it("tokenises a use case declaration", () => {
    const { errors, tokens } = UcdLexer.tokenize("use case login")
    expect(errors).toHaveLength(0)
    expect(tokens.map((t) => t.tokenType.name)).toEqual(["Use", "Case", "Identifier"])
  })

  it("tokenises a link", () => {
    const { errors, tokens } = UcdLexer.tokenize("user ->> login")
    expect(errors).toHaveLength(0)
    expect(tokens.map((t) => t.tokenType.name)).toEqual(["Identifier", "Arrow", "Identifier"])
  })

  it("produces no errors for multi-line input", () => {
    const input = "actor user\nuse case login\nuser ->> login"
    expect(UcdLexer.tokenize(input).errors).toHaveLength(0)
  })
})

// ─── Parser / visitor ────────────────────────────────────────────────────────

describe("use case diagram parser — declarations", () => {
  it("parses an actor declaration", () => {
    const { ast, lexErrors, parseErrors } = parse("actor user")
    expect(lexErrors).toHaveLength(0)
    expect(parseErrors).toHaveLength(0)
    expect(ast.declarations).toHaveLength(1)
    expect(ast.declarations[0]).toMatchObject({ entityType: "actor", path: ["user"], alias: null, id: "user" })
  })

  it("parses a component declaration", () => {
    const { ast } = parse("component fts")
    expect(ast.declarations[0]).toMatchObject({ entityType: "component", path: ["fts"], id: "fts" })
  })

  it("parses a use case declaration", () => {
    const { ast } = parse("use case login")
    expect(ast.declarations[0]).toMatchObject({ entityType: "use-case", path: ["login"], id: "login" })
  })

  it("parses a declaration with alias", () => {
    const { ast } = parse("actor user as u")
    expect(ast.declarations[0]).toMatchObject({ entityType: "actor", alias: "u", id: "u", path: ["user"] })
  })

  it("parses a multi-segment path", () => {
    const { ast } = parse("component root/services/auth")
    expect(ast.declarations[0]).toMatchObject({ entityType: "component", path: ["root", "services", "auth"], id: "auth" })
  })

  it("parses multiple declarations", () => {
    const { ast, parseErrors } = parse("actor user\nuse case login\nuse case register")
    expect(parseErrors).toHaveLength(0)
    expect(ast.declarations).toHaveLength(3)
    expect(ast.declarations.map((d) => d.id)).toEqual(["user", "login", "register"])
  })
})

describe("use case diagram parser — links", () => {
  it("parses a link between actor and use case", () => {
    const { ast, parseErrors } = parse("actor user\nuse case login\nuser ->> login")
    expect(parseErrors).toHaveLength(0)
    expect(ast.links).toHaveLength(1)
    expect(ast.links[0]).toMatchObject({ from: "user", to: "login" })
  })

  it("parses multiple links", () => {
    const { ast } = parse("user ->> login\nuser ->> register")
    expect(ast.links).toHaveLength(2)
    expect(ast.links[1]).toMatchObject({ from: "user", to: "register" })
  })
})

describe("use case diagram parser — mixed content", () => {
  it("parses a realistic diagram", () => {
    const input = `actor user
use case login
use case register
component auth
user ->> login
user ->> register
login ->> auth`
    const { ast, lexErrors, parseErrors } = parse(input)
    expect(lexErrors).toHaveLength(0)
    expect(parseErrors).toHaveLength(0)
    expect(ast.declarations).toHaveLength(4)
    expect(ast.links).toHaveLength(3)
  })
})

describe("use case diagram parser — edge cases", () => {
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
    const { ast, parseErrors } = parse("actor user\n\nuse case login")
    expect(parseErrors).toHaveLength(0)
    expect(ast.declarations).toHaveLength(2)
  })

  it("handles empty input", () => {
    const { ast, parseErrors } = parse("")
    expect(parseErrors).toHaveLength(0)
    expect(ast.declarations).toHaveLength(0)
    expect(ast.links).toHaveLength(0)
  })
})

// ─── parseUseCaseDiagram — scope validation ───────────────────────────────────

import { parseUseCaseDiagram } from "./systemUpdater"
import type { ComponentNode } from "../../store/types"

const makeComp = (uuid: string, id: string, subComponents: ComponentNode[] = []): ComponentNode => ({
  uuid, id, name: id, type: "component",
  actors: [], subComponents, useCaseDiagrams: [], interfaces: [],
})

describe("parseUseCaseDiagram — out-of-scope reference", () => {
  it("throws when referencing a cousin (child of sibling)", () => {
    const cousin = makeComp("cousin-uuid", "cousin")
    const sibling = makeComp("sibling-uuid", "sibling", [cousin])
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp, sibling])
    expect(() =>
      parseUseCaseDiagram("component sibling/cousin as c", root, ownerComp.uuid, "diag-uuid")
    ).toThrow("out of scope")
  })

  it("throws when referencing a deep cousin (grandchild of sibling)", () => {
    const deepCousin = makeComp("dc-uuid", "deepCousin")
    const cousin = makeComp("cousin-uuid", "cousin", [deepCousin])
    const sibling = makeComp("sibling-uuid", "sibling", [cousin])
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp, sibling])
    expect(() =>
      parseUseCaseDiagram("component sibling/cousin/deepCousin as dc", root, ownerComp.uuid, "diag-uuid")
    ).toThrow("out of scope")
  })

  it("does NOT throw for a relative child reference", () => {
    const child = makeComp("child-uuid", "child")
    const ownerComp = makeComp("owner-uuid", "owner", [child])
    const root = makeComp("root-uuid", "root", [ownerComp])
    expect(() =>
      parseUseCaseDiagram("component child", root, ownerComp.uuid, "diag-uuid")
    ).not.toThrow()
  })

  it("does NOT throw for a relative grandchild reference", () => {
    const grandchild = makeComp("gc-uuid", "gc")
    const child = makeComp("child-uuid", "child", [grandchild])
    const ownerComp = makeComp("owner-uuid", "owner", [child])
    const root = makeComp("root-uuid", "root", [ownerComp])
    expect(() =>
      parseUseCaseDiagram("component child/gc", root, ownerComp.uuid, "diag-uuid")
    ).not.toThrow()
  })
})

describe("parseUseCaseDiagram — auto-create missing path nodes", () => {
  it("auto-creates a missing sub-component when path parent exists", () => {
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp])
    const updated = parseUseCaseDiagram("component owner/newChild", root, ownerComp.uuid, "diag-uuid")
    const updatedOwner = updated.subComponents.find((c) => c.uuid === ownerComp.uuid)!
    expect(updatedOwner.subComponents.some((c) => c.id === "newChild")).toBe(true)
  })

  it("auto-creates a missing actor under an ancestor component", () => {
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp])
    const updated = parseUseCaseDiagram("actor owner/NewUser", root, ownerComp.uuid, "diag-uuid")
    const updatedOwner = updated.subComponents.find((c) => c.uuid === ownerComp.uuid)!
    expect(updatedOwner.actors.some((a) => a.id === "NewUser")).toBe(true)
  })

  it("auto-creates intermediate components for deep missing path", () => {
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp])
    const updated = parseUseCaseDiagram("component owner/mid/leaf", root, ownerComp.uuid, "diag-uuid")
    const updatedOwner = updated.subComponents.find((c) => c.uuid === ownerComp.uuid)!
    const mid = updatedOwner.subComponents.find((c) => c.id === "mid")
    expect(mid).toBeDefined()
    expect(mid!.subComponents.some((c) => c.id === "leaf")).toBe(true)
  })

  it("still throws for out-of-scope auto-create attempt", () => {
    const cousin = makeComp("cousin-uuid", "cousin")
    const sibling = makeComp("sibling-uuid", "sibling", [cousin])
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp, sibling])
    expect(() =>
      parseUseCaseDiagram("component sibling/cousin/newDeepCousin", root, ownerComp.uuid, "diag-uuid")
    ).toThrow()
  })
})

// ─── generateUseCaseMermaidFromAst — label resolution ────────────────────────

import { generateUseCaseMermaidFromAst } from "./mermaidGenerator"
import { buildUcdAst as buildAst } from "./visitor"

function makeMermaidComp(uuid: string, id: string, name: string, subComponents: ComponentNode[] = []): ComponentNode {
  return { uuid, id, name, type: "component", actors: [], subComponents, useCaseDiagrams: [], interfaces: [] }
}

function parseUcdAst(input: string) {
  const { cst } = parseUseCaseDiagramCst(input)
  return buildAst(cst)
}

describe("generateUseCaseMermaidFromAst — display labels", () => {
  it("uses node name when no alias given", () => {
    const actor = { uuid: "a-uuid", id: "alice", name: "Alice Smith", type: "actor" as const }
    const owner = makeMermaidComp("root-uuid", "root", "Root", [])
    owner.actors = [actor]
    const root = owner
    const ast = parseUcdAst("actor alice")
    const { mermaidContent } = generateUseCaseMermaidFromAst(ast, owner, root)
    expect(mermaidContent).toContain('"Alice Smith"')
    expect(mermaidContent).not.toContain('"alice"')
  })

  it("uses node name even when alias is specified (alias is local id only)", () => {
    const actor = { uuid: "a-uuid", id: "alice", name: "Alice Smith", type: "actor" as const }
    const owner = makeMermaidComp("root-uuid", "root", "Root", [])
    owner.actors = [actor]
    const root = owner
    const ast = parseUcdAst("actor alice as Customer")
    const { mermaidContent } = generateUseCaseMermaidFromAst(ast, owner, root)
    // "Customer" is the Mermaid node id; "Alice Smith" is the display label
    expect(mermaidContent).toContain('"Alice Smith"')
    expect(mermaidContent).toMatch(/Customer\["Alice Smith"\]/)
  })

  it("falls back to last path segment when node not found", () => {
    const owner = makeMermaidComp("root-uuid", "root", "Root", [])
    const ast = parseUcdAst("component unknown")
    const { mermaidContent } = generateUseCaseMermaidFromAst(ast, owner, owner)
    expect(mermaidContent).toContain('"unknown"')
  })

  it("uses component node name for component participant", () => {
    const svc = makeMermaidComp("svc-uuid", "svc", "Order Service")
    const owner = makeMermaidComp("root-uuid", "root", "Root", [svc])
    const ast = parseUcdAst("component svc")
    const { mermaidContent } = generateUseCaseMermaidFromAst(ast, owner, owner)
    expect(mermaidContent).toContain('"Order Service"')
  })
})
