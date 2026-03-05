/**
 * integraLanguage.test.ts
 *
 * Unit tests for the Chevrotain-based annotation builder in integraLanguage.ts.
 * Tests verify that:
 *   - Token types are mapped to the correct CSS classes
 *   - The navigation map (uuid entries) is built correctly
 *   - Edge cases (empty doc, partial lines, multi-line) are handled
 */
import { describe, it, expect } from "vitest"
import { buildAnnotations, CLS, type DiagramContext } from "./integraLanguage"
import type { ComponentNode } from "../../../store/types"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRoot(overrides: Partial<ComponentNode> = {}): ComponentNode {
  return {
    uuid: "root-uuid",
    id: "root",
    name: "Root",
    type: "component",
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
    ...overrides,
  }
}

function makeCtx(
  diagramType: DiagramContext["diagramType"],
  root: ComponentNode,
  ownerComp: ComponentNode | null = root,
): DiagramContext {
  return { diagramType, rootComponent: root, ownerComp }
}

// ─── Empty / trivial ──────────────────────────────────────────────────────────

describe("buildAnnotations — empty / trivial", () => {
  it("returns empty array for empty document", () => {
    expect(buildAnnotations("", makeCtx("sequence-diagram", makeRoot()))).toEqual([])
  })

  it("falls back to default class for unrecognised lines", () => {
    const anns = buildAnnotations("hello world", makeCtx("sequence-diagram", makeRoot()))
    const defaultEntry = anns.find((a) => a.cls === CLS.default)
    expect(defaultEntry).toBeDefined()
  })
})

// ─── Sequence diagram ─────────────────────────────────────────────────────────

describe("buildAnnotations — sequence diagram", () => {
  it("highlights 'actor' keyword with keyword class", () => {
    const anns = buildAnnotations(
      'actor "User" as user',
      makeCtx("sequence-diagram", makeRoot()),
    )
    const kwEntry = anns.find((a) => a.cls === CLS.keyword)
    expect(kwEntry).toBeDefined()
    expect(kwEntry!.to - kwEntry!.from).toBe("actor".length)
  })

  it("highlights quoted name with name class", () => {
    const anns = buildAnnotations(
      'actor "User" as user',
      makeCtx("sequence-diagram", makeRoot()),
    )
    expect(anns.some((a) => a.cls === CLS.name)).toBe(true)
  })

  it("highlights participant id with identifier class", () => {
    const anns = buildAnnotations(
      'actor "User" as user',
      makeCtx("sequence-diagram", makeRoot()),
    )
    const idEntry = anns.find((a) => a.cls === CLS.identifier)
    expect(idEntry).toBeDefined()
  })

  it("highlights arrow (->>  ) with operator class", () => {
    const anns = buildAnnotations(
      "sender->>receiver: SomeLabel",
      makeCtx("sequence-diagram", makeRoot()),
    )
    const opEntry = anns.find((a) => a.cls === CLS.operator && a.to - a.from > 1)
    expect(opEntry).toBeDefined()
  })

  it("highlights InterfaceId:FunctionId with function class", () => {
    const anns = buildAnnotations(
      "sender->>receiver: IFace:doThing(x: string)",
      makeCtx("sequence-diagram", makeRoot()),
    )
    const fnEntry = anns.find((a) => a.cls === CLS.function)
    expect(fnEntry).toBeDefined()
  })

  it("highlights UseCase:ucId with function class", () => {
    const anns = buildAnnotations(
      "sender->>receiver: UseCase:login",
      makeCtx("sequence-diagram", makeRoot()),
    )
    const fnEntry = anns.find((a) => a.cls === CLS.function)
    expect(fnEntry).toBeDefined()
  })

  it("highlights plain message label with label class", () => {
    const anns = buildAnnotations(
      "sender->>receiver: plain text label",
      makeCtx("sequence-diagram", makeRoot()),
    )
    const labelEntry = anns.find((a) => a.cls === CLS.label)
    expect(labelEntry).toBeDefined()
  })

  it("highlights 'component' keyword on bare declaration", () => {
    const anns = buildAnnotations(
      "component svc",
      makeCtx("sequence-diagram", makeRoot()),
    )
    expect(anns.some((a) => a.cls === CLS.keyword)).toBe(true)
  })

  it("correctly computes offsets across multiple lines", () => {
    const doc = 'actor "A" as a\nactor "B" as b'
    const anns = buildAnnotations(doc, makeCtx("sequence-diagram", makeRoot()))
    const offsets = anns.map((a) => a.from)
    // Second line starts after first line length + newline
    expect(offsets.some((o) => o > "actor ".length + 4 + " as a".length)).toBe(true)
  })
})

// ─── Use-case diagram ─────────────────────────────────────────────────────────

describe("buildAnnotations — use-case diagram", () => {
  it("highlights 'use case' keyword span", () => {
    const anns = buildAnnotations(
      'use case "Login" as login',
      makeCtx("use-case-diagram", makeRoot()),
    )
    const kwEntry = anns.find((a) => a.cls === CLS.keyword)
    expect(kwEntry).toBeDefined()
  })

  it("highlights arrow in relation line with operator class", () => {
    const anns = buildAnnotations(
      "user --> login",
      makeCtx("use-case-diagram", makeRoot()),
    )
    const opEntry = anns.find((a) => a.cls === CLS.operator)
    expect(opEntry).toBeDefined()
  })
})

// ─── Navigation map ───────────────────────────────────────────────────────────

describe("buildAnnotations — navigation map (uuid)", () => {
  it("records uuid for actor id when actor exists in ownerComp", () => {
    const root = makeRoot({
      actors: [{ uuid: "actor-uuid", id: "user", name: "User", type: "actor" }],
    })
    const anns = buildAnnotations(
      'actor "User" as user',
      makeCtx("sequence-diagram", root),
    )
    const navEntry = anns.find((a) => a.uuid === "actor-uuid")
    expect(navEntry).toBeDefined()
  })

  it("does not record uuid when participant is not in the tree", () => {
    const root = makeRoot()
    const anns = buildAnnotations(
      'actor "Unknown" as unknown',
      makeCtx("sequence-diagram", root),
    )
    expect(anns.every((a) => a.uuid === undefined)).toBe(true)
  })

  it("records uuid for subcomponent in sequence diagram", () => {
    const sub: ComponentNode = makeRoot({ uuid: "sub-uuid", id: "svc", name: "Svc" })
    const root = makeRoot({ subComponents: [sub] })
    const anns = buildAnnotations(
      'component "Svc" as svc',
      makeCtx("sequence-diagram", root),
    )
    const navEntry = anns.find((a) => a.uuid === "sub-uuid")
    expect(navEntry).toBeDefined()
  })

  it("navMap entries (uuid set) are a subset of all annotations", () => {
    const root = makeRoot({
      actors: [{ uuid: "actor-uuid", id: "user", name: "User", type: "actor" }],
    })
    const anns = buildAnnotations(
      'actor "User" as user\nactor "User" as user',
      makeCtx("sequence-diagram", root),
    )
    const navEntries = anns.filter((a) => !!a.uuid)
    expect(navEntries.length).toBeGreaterThan(0)
    navEntries.forEach((n) => expect(n.uuid).toBeTruthy())
  })
})

// ─── CSS class constants ──────────────────────────────────────────────────────

describe("CLS constants", () => {
  it("all class names start with cm-integra-", () => {
    Object.values(CLS).forEach((c) => {
      expect(c).toMatch(/^cm-integra-/)
    })
  })

  it("all class names are unique", () => {
    const values = Object.values(CLS)
    expect(new Set(values).size).toBe(values.length)
  })
})
