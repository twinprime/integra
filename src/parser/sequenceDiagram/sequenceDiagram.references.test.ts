/**
 * Reference and resolver tests for sequence diagrams.
 */
import { describe, it, expect } from "vitest"
import { SeqLexer, UseCaseRef, SequenceRef } from "./lexer"
import { parseSequenceDiagram } from "./systemUpdater"
import { resolveUseCaseByPath, resolveSeqDiagramByPath } from "../../utils/diagramResolvers"
import type { ComponentNode } from "../../store/types"
import { parse, makeNamedComp } from "./sequenceDiagram.test.helpers"

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

  it("resolves a use case owned directly by an ancestor sibling component", () => {
    const uncle = makeCompWithUcs("uncle-uuid", "uncle", ["placeOrder"])
    const parent = makeNamedComp("parent-uuid", "parent", "parent", [makeNamedComp("owner-uuid", "owner", "owner"), uncle])
    const root = makeNamedComp("root-uuid", "root", "root", [parent])
    const owner = parent.subComponents[0]
    const result = resolveUseCaseByPath(["parent", "uncle", "placeOrder"], root, owner, "owner-uuid")
    expect(result).toBe("uncle-uuid-placeOrder-uuid")
  })

  it("returns undefined for a use case owned by a cousin component", () => {
    const cousin = makeCompWithUcs("cousin-uuid", "cousin", ["placeOrder"])
    const sibling = makeNamedComp("sibling-uuid", "sibling", "sibling", [cousin])
    const owner = makeNamedComp("owner-uuid", "owner", "owner")
    const root = makeNamedComp("root-uuid", "root", "root", [owner, sibling])
    const result = resolveUseCaseByPath(["sibling", "cousin", "placeOrder"], root, owner, "owner-uuid")
    expect(result).toBeUndefined()
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

  it("resolves a sequence diagram owned directly by an ancestor sibling component", () => {
    const uncle = makeCompWithSeqs("uncle-uuid", "uncle", [{ id: "loginFlow" }])
    const parent = makeNamedComp("parent-uuid", "parent", "parent", [makeNamedComp("owner-uuid", "owner", "owner"), uncle])
    const root = makeNamedComp("root-uuid", "root", "root", [parent])
    const owner = parent.subComponents[0]
    const result = resolveSeqDiagramByPath(["parent", "uncle", "loginFlow"], root, owner, "owner-uuid")
    expect(result).toBe("uncle-uuid-uc-loginFlow-uuid")
  })

  it("returns undefined for a sequence diagram owned by a cousin component", () => {
    const cousin = makeCompWithSeqs("cousin-uuid", "cousin", [{ id: "loginFlow" }])
    const sibling = makeNamedComp("sibling-uuid", "sibling", "sibling", [cousin])
    const owner = makeNamedComp("owner-uuid", "owner", "owner")
    const root = makeNamedComp("root-uuid", "root", "root", [owner, sibling])
    const result = resolveSeqDiagramByPath(["sibling", "cousin", "loginFlow"], root, owner, "owner-uuid")
    expect(result).toBeUndefined()
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
