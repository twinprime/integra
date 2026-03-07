// @vitest-environment node
import { describe, it, expect } from "vitest"
import { buildUseCaseClassDiagram } from "./useCaseClassDiagram"
import type { ComponentNode, UseCaseNode, SequenceDiagramNode } from "../store/types"

// ─── Test fixtures ────────────────────────────────────────────────────────────

const makeSeqDiagram = (content: string, ownerUuid = "compa-uuid"): SequenceDiagramNode => ({
  uuid: "seq-uuid",
  id: "seq",
  name: "Sequence Diagram",
  type: "sequence-diagram",
  content,
  description: "",
  ownerComponentUuid: ownerUuid,
  referencedNodeIds: [],
  referencedFunctionUuids: [],
})

const makeUseCase = (...diagrams: SequenceDiagramNode[]): UseCaseNode => ({
  uuid: "uc-uuid",
  id: "uc",
  name: "Use Case",
  type: "use-case",
  sequenceDiagrams: diagrams,
})

/**
 * Root tree used across most tests:
 *
 *   root
 *   └── compA  (interfaces: [IFoo])
 *         ├── actors: [user]
 *         └── subComponents: [compB]
 */
const makeRoot = (): ComponentNode => ({
  uuid: "root-uuid",
  id: "root",
  name: "Root",
  type: "component",
  subComponents: [
    {
      uuid: "compa-uuid",
      id: "compA",
      name: "Component A",
      type: "component",
      subComponents: [
        {
          uuid: "compb-uuid",
          id: "compB",
          name: "Component B",
          type: "component",
          subComponents: [],
          actors: [],
          useCaseDiagrams: [],
          interfaces: [],
        },
      ],
      actors: [{ uuid: "user-uuid", id: "user", name: "User", type: "actor" }],
      useCaseDiagrams: [],
      interfaces: [
        {
          uuid: "ifoo-uuid",
          id: "IFoo",
          name: "IFoo",
          type: "rest",
          functions: [{ uuid: "fn-uuid", id: "doSomething", parameters: [] }],
        },
      ],
    },
  ],
  actors: [],
  useCaseDiagrams: [],
  interfaces: [],
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildUseCaseClassDiagram", () => {
  it("returns empty when no sequence diagrams exist", () => {
    const uc = makeUseCase()
    const result = buildUseCaseClassDiagram(uc, makeRoot())
    expect(result.mermaidContent).toBe("")
    expect(result.idToUuid).toEqual({})
  })

  it("returns empty when all sequence diagrams have empty content", () => {
    const uc = makeUseCase(makeSeqDiagram(""), makeSeqDiagram("   "))
    const result = buildUseCaseClassDiagram(uc, makeRoot())
    expect(result.mermaidContent).toBe("")
  })

  it("generates actor class with <<actor>> annotation", () => {
    const content = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).toContain('class user["User"]:::actor {')
    expect(result.mermaidContent).toContain("<<actor>>")
  })

  it("generates component class without annotation", () => {
    const content = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).toContain('class compA["Component A"]:::component')
    expect(result.mermaidContent).not.toMatch(/class compA\[.*\]:::component\s*\{/)
  })

  it("generates interface class with <<interface>> and method", () => {
    const content = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething(id: string)`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).toContain("class IFoo {")
    expect(result.mermaidContent).toContain("<<interface>>")
    expect(result.mermaidContent).toContain("+doSomething(id: string)")
  })

  it("generates realization arrow from component to interface (..|>)", () => {
    const content = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).toContain("compA ..|> IFoo")
  })

  it("generates dependency arrow from sender to interface (..>)", () => {
    const content = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).toContain("user ..> IFoo")
  })

  it("generates direct dependency arrow for non-interface messages (..>)", () => {
    const content = `component compA\ncomponent compB\ncompA ->> compB: someMessage`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).toContain("compA ..> compB")
  })

  it("omits self-messages from direct arrows", () => {
    const content = `component compA\ncompA ->> compA: internalCall`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).not.toContain("compA ..> compA")
  })

  it("omits interface messages from direct arrows", () => {
    const content = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).toContain("user ..> IFoo")
    expect(result.mermaidContent).not.toContain("user ..> compA")
  })

  it("deduplicates interface methods across multiple sequence diagrams", () => {
    const content1 = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething(id: string)`
    const content2 = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething(id: string)`
    const seq1 = makeSeqDiagram(content1)
    const seq2 = { ...makeSeqDiagram(content2), uuid: "seq2-uuid" }
    const result = buildUseCaseClassDiagram(makeUseCase(seq1, seq2), makeRoot())
    const matches = result.mermaidContent.match(/\+doSomething/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it("includes multiple distinct methods on the same interface", () => {
    const content = [
      `actor user`,
      `component compA`,
      `user ->> compA: IFoo:doSomething(id: string)`,
      `user ->> compA: IFoo:getAll()`,
    ].join("\n")
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).toContain("+doSomething(id: string)")
    expect(result.mermaidContent).toContain("+getAll()")
  })

  it("deduplicates participants across multiple sequence diagrams", () => {
    const content1 = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const content2 = `actor user\ncomponent compA\nuser ->> compA: IFoo:getAll()`
    const seq1 = makeSeqDiagram(content1)
    const seq2 = { ...makeSeqDiagram(content2), uuid: "seq2-uuid" }
    const result = buildUseCaseClassDiagram(makeUseCase(seq1, seq2), makeRoot())
    const matches = result.mermaidContent.match(/class user\[/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it("includes click directives for all participant nodes", () => {
    const content = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).toContain('click user call __integraNavigate("user")')
    expect(result.mermaidContent).toContain('click compA call __integraNavigate("compA")')
  })

  it("populates idToUuid map for all participants", () => {
    const content = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.idToUuid).toMatchObject({
      user: "user-uuid",
      compA: "compa-uuid",
    })
  })

  it("starts with classDiagram keyword", () => {
    const content = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).toMatch(/^classDiagram/)
  })

  it("resolves participant via alias (actor id as alias)", () => {
    // user node has id "user"; alias it as "u" in the spec
    const content = `actor user as u\ncomponent compA\nu ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).toContain('class user["User"]:::actor')
    expect(result.mermaidContent).toContain("user ..> IFoo")
  })

  it("resolves participant via path (component root/compA/compB)", () => {
    // compB is accessed via multi-segment path from root
    const content = `component root/compA/compB as compB\ncomponent compA\ncompA ->> compB: someCall`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).toContain('class compB["Component B"]:::component')
    expect(result.mermaidContent).toContain("compA ..> compB")
  })
})
