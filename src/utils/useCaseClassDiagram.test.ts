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

  it("does not generate actor classes", () => {
    const content = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).not.toContain('class user["User"]:::actor')
    expect(result.mermaidContent).not.toContain("<<actor>>")
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
    expect(result.mermaidContent).toContain('class IFoo["IFoo"] {')
    expect(result.mermaidContent).toContain("<<interface>>")
    expect(result.mermaidContent).toContain("+doSomething(id: string)")
  })

  it("uses interface name (not id) as the class label", () => {
    const root = makeRoot()
    const rootWithNamedIface: ComponentNode = {
      ...root,
      subComponents: [
        {
          ...root.subComponents[0],
          interfaces: [
            {
              uuid: "ifoo-uuid",
              id: "IFoo",
              name: "Foo Interface",
              type: "rest",
              functions: [{ uuid: "fn-uuid", id: "doSomething", parameters: [] }],
            },
          ],
        },
        ...root.subComponents.slice(1),
      ],
    }
    const content = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), rootWithNamedIface)
    expect(result.mermaidContent).toContain('class IFoo["Foo Interface"] {')
    expect(result.mermaidContent).not.toContain('class IFoo {')
  })

  it("generates realization arrow from component to interface (..|>)", () => {
    const content = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).toContain("compA ..|> IFoo")
  })

  it("omits actor dependency arrows to interfaces", () => {
    const content = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).not.toContain("user ..> IFoo")
  })

  it("generates direct dependency arrow for non-interface messages (..>)", () => {
    const content = `component compA\ncomponent compB\ncompA ->> compB: someMessage`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).toContain("compA ..> compB")
  })

  it("tracks sequence-diagram provenance for dependency arrows", () => {
    const content = `component compA\ncomponent compB\ncompA ->> compB: someMessage`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())

    expect(result.relationshipMetadata).toContainEqual({
      sequenceDiagrams: [{ uuid: "seq-uuid", name: "Sequence Diagram" }],
    })
  })

  it("omits self-messages from direct arrows", () => {
    const content = `component compA\ncompA ->> compA: internalCall`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).not.toContain("compA ..> compA")
  })

  it("omits interface messages from direct arrows", () => {
    const content = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).not.toContain("user ..> IFoo")
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

  it("deduplicates component participants across multiple sequence diagrams", () => {
    const content1 = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const content2 = `actor user\ncomponent compA\nuser ->> compA: IFoo:getAll()`
    const seq1 = makeSeqDiagram(content1)
    const seq2 = { ...makeSeqDiagram(content2), uuid: "seq2-uuid" }
    const result = buildUseCaseClassDiagram(makeUseCase(seq1, seq2), makeRoot())
    const matches = result.mermaidContent.match(/class compA\[/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it("includes click directives only for component participant nodes", () => {
    const content = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).not.toContain('click user call __integraNavigate("user")')
    expect(result.mermaidContent).toContain('click compA call __integraNavigate("compA")')
  })

  it("omits actors from idToUuid", () => {
    const content = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.idToUuid).toMatchObject({
      compA: "compa-uuid",
    })
    expect(result.idToUuid.user).toBeUndefined()
  })

  it("starts with classDiagram keyword", () => {
    const content = `actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).toMatch(/^classDiagram/)
  })

  it("keeps interface extraction when actor sender is referenced via alias", () => {
    // user node has id "user"; alias it as "u" in the spec
    const content = `actor user as u\ncomponent compA\nu ->> compA: IFoo:doSomething()`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).not.toContain('class user["User"]:::actor')
    expect(result.mermaidContent).toContain('class IFoo["IFoo"] {')
    expect(result.mermaidContent).toContain("compA ..|> IFoo")
  })

  it("resolves participant via path (component root/compA/compB)", () => {
    // compB is accessed via multi-segment path from root
    const content = `component root/compA/compB as compB\ncomponent compA\ncompA ->> compB: someCall`
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).toContain('class compB["Component B"]:::component')
    expect(result.mermaidContent).toContain("compA ..> compB")
  })

  it("includes interface calls inside a loop block", () => {
    const content = [
      "actor user",
      "component compA",
      "loop poll",
      "  user ->> compA: IFoo:doSomething(id: string)",
      "end",
    ].join("\n")
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).toContain('class IFoo["IFoo"] {')
    expect(result.mermaidContent).not.toContain("user ..> IFoo")
    expect(result.mermaidContent).toContain("compA ..|> IFoo")
  })

  it("includes interface calls inside an opt block", () => {
    const content = [
      "actor user",
      "component compA",
      "opt if premium",
      "  user ->> compA: IFoo:doSomething(id: string)",
      "end",
    ].join("\n")
    const result = buildUseCaseClassDiagram(makeUseCase(makeSeqDiagram(content)), makeRoot())
    expect(result.mermaidContent).not.toContain("user ..> IFoo")
    expect(result.mermaidContent).toContain("compA ..|> IFoo")
  })
})
