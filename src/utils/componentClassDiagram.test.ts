// @vitest-environment node
import { describe, it, expect } from "vitest"
import { buildComponentClassDiagram } from "./componentClassDiagram"
import type { ComponentNode, SequenceDiagramNode, UseCaseNode, UseCaseDiagramNode } from "../store/types"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeSeqDiagram = (content: string, ownerUuid = "root-uuid"): SequenceDiagramNode => ({
  uuid: "seq-uuid",
  id: "seq",
  name: "Seq",
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

const makeUcd = (...useCases: UseCaseNode[]): UseCaseDiagramNode => ({
  uuid: "ucd-uuid",
  id: "ucd",
  name: "UCD",
  type: "use-case-diagram",
  content: "",
  description: "",
  ownerComponentUuid: "root-uuid",
  referencedNodeIds: [],
  useCases,
})

/**
 * Root tree used across most tests:
 *
 *   root (uuid: root-uuid)
 *   ├── actor: user (uuid: user-uuid)
 *   └── subComponents:
 *       ├── compA (uuid: compa-uuid)  ← target, interfaces: [IFoo, IBar]
 *       └── compB (uuid: compb-uuid)
 */
const makeRoot = (extraSeqDiagrams: SequenceDiagramNode[] = []): ComponentNode => ({
  uuid: "root-uuid",
  id: "root",
  name: "Root",
  type: "component",
  actors: [{ uuid: "user-uuid", id: "user", name: "User", type: "actor", description: "" }],
  subComponents: [
    {
      uuid: "compa-uuid",
      id: "compA",
      name: "Component A",
      type: "component",
      subComponents: [],
      actors: [],
      useCaseDiagrams: [],
      interfaces: [
        {
          uuid: "ifoo-uuid",
          id: "IFoo",
          name: "IFoo",
          type: "rest",
          functions: [
            {
              uuid: "fn1-uuid",
              id: "doSomething",
              parameters: [{ name: "id", type: "string", required: true }],
            },
          ],
        },
        {
          uuid: "ibar-uuid",
          id: "IBar",
          name: "IBar",
          type: "rest",
          functions: [
            {
              uuid: "fn2-uuid",
              id: "getAll",
              parameters: [{ name: "page", type: "number", required: false }],
            },
          ],
        },
      ],
    },
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
  useCaseDiagrams: extraSeqDiagrams.length
    ? [makeUcd(makeUseCase(...extraSeqDiagrams))]
    : [],
  interfaces: [],
})

const getCompA = (root: ComponentNode) => root.subComponents[0]

/** Root where compB has a defined interface IBaz */
const makeRootWithCompBInterfaces = (extraSeqDiagrams: SequenceDiagramNode[] = []): ComponentNode => {
  const base = makeRoot(extraSeqDiagrams)
  return {
    ...base,
    subComponents: [
      base.subComponents[0], // compA unchanged
      {
        ...base.subComponents[1],
        interfaces: [
          {
            uuid: "ibaz-uuid",
            id: "IBaz",
            name: "IBaz",
            type: "rest",
            functions: [
              {
                uuid: "fn3-uuid",
                id: "process",
                parameters: [{ name: "data", type: "string", required: true }],
              },
            ],
          },
        ],
      },
    ],
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildComponentClassDiagram", () => {
  it("returns empty when component has no interfaces", () => {
    const root = makeRoot()
    const compB = root.subComponents[1]
    const result = buildComponentClassDiagram(compB, root)
    expect(result.mermaidContent).toBe("")
    expect(result.idToUuid).toEqual({})
  })

  it("returns empty for empty interfaces array", () => {
    const root = makeRoot()
    const compB = { ...root.subComponents[1], interfaces: [] }
    expect(buildComponentClassDiagram(compB, root).mermaidContent).toBe("")
  })

  it("shows component and its interfaces even with no callers", () => {
    const root = makeRoot()
    const result = buildComponentClassDiagram(getCompA(root), root)
    expect(result.mermaidContent).toContain('class compA["Component A"]')
    expect(result.mermaidContent).toContain('class IFoo["IFoo"] {')
    expect(result.mermaidContent).toContain("<<interface>>")
    expect(result.mermaidContent).toContain("+doSomething(id: string)")
    expect(result.mermaidContent).toContain('class IBar["IBar"] {')
    expect(result.mermaidContent).toContain("+getAll(page: number?)")
  })

  it("uses interface name (not id) as the class label", () => {
    const base = makeRoot()
    const root: ComponentNode = {
      ...base,
      subComponents: [
        {
          ...base.subComponents[0],
          interfaces: [
            {
              uuid: "ifoo-uuid",
              id: "IFoo",
              name: "Foo Interface",
              type: "rest",
              functions: [],
            },
          ],
        },
        base.subComponents[1],
      ],
    }
    const result = buildComponentClassDiagram(root.subComponents[0], root)
    expect(result.mermaidContent).toContain('class IFoo["Foo Interface"] {')
    expect(result.mermaidContent).not.toContain('class IFoo {')
  })

  it("generates realization arrows from component to each interface", () => {
    const root = makeRoot()
    const result = buildComponentClassDiagram(getCompA(root), root)
    expect(result.mermaidContent).toContain("compA ..|> IFoo")
    expect(result.mermaidContent).toContain("compA ..|> IBar")
  })

  it("includes click handler for the component itself", () => {
    const root = makeRoot()
    const result = buildComponentClassDiagram(getCompA(root), root)
    expect(result.mermaidContent).toContain('click compA call __integraNavigate("compA")')
    expect(result.idToUuid["compA"]).toBe("compa-uuid")
  })

  it("detects an actor caller and adds dependency arrow", () => {
    const sd = makeSeqDiagram(
      "actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething(id: string)",
    )
    const root = makeRoot([sd])
    const result = buildComponentClassDiagram(getCompA(root), root)
    expect(result.mermaidContent).toContain('class user["User"]:::actor {')
    expect(result.mermaidContent).toContain("<<actor>>")
    expect(result.mermaidContent).toContain("user ..> IFoo")
  })

  it("detects a component caller and adds dependency arrow", () => {
    const sd = makeSeqDiagram(
      "component compB\ncomponent compA\ncompB ->> compA: IFoo:doSomething(id: string)",
    )
    const root = makeRoot([sd])
    const result = buildComponentClassDiagram(getCompA(root), root)
    expect(result.mermaidContent).toContain('class compB["Component B"]:::component')
    expect(result.mermaidContent).not.toMatch(/class compB\[.*\]:::component\s*\{/)
    expect(result.mermaidContent).toContain("compB ..> IFoo")
  })

  it("records caller's uuid in idToUuid for navigation", () => {
    const sd = makeSeqDiagram(
      "actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething(id: string)",
    )
    const root = makeRoot([sd])
    const result = buildComponentClassDiagram(getCompA(root), root)
    expect(result.idToUuid["user"]).toBe("user-uuid")
    expect(result.mermaidContent).toContain('click user call __integraNavigate("user")')
  })

  it("deduplicates repeated calls from the same caller to the same interface", () => {
    const sd = makeSeqDiagram(
      [
        "actor user",
        "component compA",
        "user ->> compA: IFoo:doSomething(id: string)",
        "user ->> compA: IFoo:doSomething(id: string)",
      ].join("\n"),
    )
    const root = makeRoot([sd])
    const result = buildComponentClassDiagram(getCompA(root), root)
    const occurrences = (result.mermaidContent.match(/user \.\.> IFoo/g) ?? []).length
    expect(occurrences).toBe(1)
  })

  it("shows separate dependency arrows for calls to different interfaces", () => {
    const sd = makeSeqDiagram(
      [
        "actor user",
        "component compA",
        "user ->> compA: IFoo:doSomething(id: string)",
        "user ->> compA: IBar:getAll()",
      ].join("\n"),
    )
    const root = makeRoot([sd])
    const result = buildComponentClassDiagram(getCompA(root), root)
    expect(result.mermaidContent).toContain("user ..> IFoo")
    expect(result.mermaidContent).toContain("user ..> IBar")
  })

  it("skips the target component itself as a caller (self-reference)", () => {
    const sd = makeSeqDiagram(
      "component compA\ncomponent compA\ncompA ->> compA: IFoo:doSomething(id: string)",
      "compa-uuid",
    )
    const root = makeRoot([sd])
    const result = buildComponentClassDiagram(getCompA(root), root)
    expect(result.mermaidContent).not.toContain("compA ..> IFoo")
  })

  it("does not include callers when receiver resolves to a different component (disambiguation)", () => {
    // compC also has an IFoo interface; seq diagram calls compC's IFoo, not compA's
    const compC: ComponentNode = {
      uuid: "compc-uuid",
      id: "compC",
      name: "Component C",
      type: "component",
      subComponents: [],
      actors: [],
      useCaseDiagrams: [],
      interfaces: [
        {
          uuid: "ifoo-c-uuid",
          id: "IFoo",
          name: "IFoo",
          type: "rest",
          functions: [],
        },
      ],
    }
    const sd = makeSeqDiagram(
      "actor user\ncomponent compC\nuser ->> compC: IFoo:doSomething(id: string)",
    )
    const root: ComponentNode = {
      uuid: "root-uuid",
      id: "root",
      name: "Root",
      type: "component",
      actors: [{ uuid: "user-uuid", id: "user", name: "User", type: "actor", description: "" }],
      subComponents: [
        {
          ...getCompA(makeRoot()),
          // compA has IFoo
        },
        compC,
      ],
      useCaseDiagrams: [makeUcd(makeUseCase(sd))],
      interfaces: [],
    }
    const result = buildComponentClassDiagram(root.subComponents[0], root)
    // user called compC's IFoo, not compA's IFoo — must not appear as compA dependent
    expect(result.mermaidContent).not.toContain("user ..> IFoo")
    expect(result.idToUuid["user"]).toBeUndefined()
  })

  it("returns empty mermaidContent when content is blank", () => {
    const sd = makeSeqDiagram("   ")
    const root = makeRoot([sd])
    const result = buildComponentClassDiagram(getCompA(root), root)
    // No callers found, but interfaces exist — still shows interfaces
    expect(result.mermaidContent).toContain("classDiagram")
    expect(result.mermaidContent).not.toContain("user ..>")
  })

  it("formats optional parameters with trailing ?", () => {
    const root = makeRoot()
    const result = buildComponentClassDiagram(getCompA(root), root)
    expect(result.mermaidContent).toContain("+getAll(page: number?)")
  })

  it("formats required parameters without ?", () => {
    const root = makeRoot()
    const result = buildComponentClassDiagram(getCompA(root), root)
    expect(result.mermaidContent).toContain("+doSomething(id: string)")
    expect(result.mermaidContent).not.toContain("+doSomething(id: string?)")
  })

  it("finds callers inside an opt block", () => {
    const sd = makeSeqDiagram(
      ["actor user", "component compA", "opt if needed", "  user ->> compA: IFoo:doSomething(id: string)", "end"].join(
        "\n",
      ),
    )
    const root = makeRoot([sd])
    const result = buildComponentClassDiagram(getCompA(root), root)
    expect(result.mermaidContent).toContain("user ..> IFoo")
  })

  it("finds callers inside a loop block", () => {
    const sd = makeSeqDiagram(
      ["component compB", "component compA", "loop retry", "  compB ->> compA: IFoo:doSomething(id: string)", "end"].join(
        "\n",
      ),
    )
    const root = makeRoot([sd])
    const result = buildComponentClassDiagram(getCompA(root), root)
    expect(result.mermaidContent).toContain("compB ..> IFoo")
  })

  it("finds callers inside an alt/else block", () => {
    const sd = makeSeqDiagram(
      [
        "actor user",
        "component compA",
        "alt happy path",
        "  user ->> compA: IFoo:doSomething(id: string)",
        "else fallback",
        "  user ->> compA: IBar:getAll()",
        "end",
      ].join("\n"),
    )
    const root = makeRoot([sd])
    const result = buildComponentClassDiagram(getCompA(root), root)
    expect(result.mermaidContent).toContain("user ..> IFoo")
    expect(result.mermaidContent).toContain("user ..> IBar")
  })

  it("uses style directive to highlight subject component in blue", () => {
    const root = makeRoot()
    const result = buildComponentClassDiagram(getCompA(root), root)
    expect(result.mermaidContent).toContain("style compA fill:#1d4ed8")
    expect(result.mermaidContent).not.toContain(":::subject")
  })

  it("emits style directives for subject and its own interfaces", () => {
    const root = makeRoot()
    const result = buildComponentClassDiagram(getCompA(root), root)
    expect(result.mermaidContent).toContain("style compA fill:#1d4ed8,stroke:#1e3a5f,color:#ffffff")
    expect(result.mermaidContent).toContain("style IFoo fill:#bfdbfe,stroke:#2563eb,color:#1e3a5f")
    expect(result.mermaidContent).toContain("style IBar fill:#bfdbfe,stroke:#2563eb,color:#1e3a5f")
  })

  it("does not emit style directives for dependency interfaces (only own interfaces are highlighted)", () => {
    const sd = makeSeqDiagram(
      "component compA\ncomponent compB\ncompA ->> compB: IBaz:process(data: string)",
    )
    const root = makeRootWithCompBInterfaces([sd])
    const result = buildComponentClassDiagram(getCompA(root), root)
    // IBaz is a dependency interface — should NOT have subject styling
    expect(result.mermaidContent).not.toContain("style IBaz")
  })

  it("applies :::subjectInterface to subject's own interfaces", () => {
    const root = makeRoot()
    const result = buildComponentClassDiagram(getCompA(root), root)
    expect(result.mermaidContent).toContain("style IFoo fill:#bfdbfe")
    expect(result.mermaidContent).toContain("style IBar fill:#bfdbfe")
  })

  it("shows outgoing call to another component's interface as dependency", () => {
    const sd = makeSeqDiagram(
      "component compA\ncomponent compB\ncompA ->> compB: IBaz:process(data: string)",
    )
    const root = makeRootWithCompBInterfaces([sd])
    const result = buildComponentClassDiagram(getCompA(root), root)
    // dependency interface class with methods
    expect(result.mermaidContent).toContain('class IBaz["IBaz"] {')
    expect(result.mermaidContent).toContain("+process(data: string)")
    // receiver implements interface
    expect(result.mermaidContent).toContain("compB ..|> IBaz")
    // this component depends on interface
    expect(result.mermaidContent).toContain("compA ..> IBaz")
    // receiver component class shown for context/navigation but no redundant direct arrow
    expect(result.mermaidContent).toContain('class compB["Component B"]')
    expect(result.mermaidContent).not.toContain("compA ..> compB")
  })

  it("records receiver's uuid in idToUuid for navigation", () => {
    const sd = makeSeqDiagram(
      "component compA\ncomponent compB\ncompA ->> compB: IBaz:process(data: string)",
    )
    const root = makeRootWithCompBInterfaces([sd])
    const result = buildComponentClassDiagram(getCompA(root), root)
    expect(result.idToUuid["compB"]).toBe("compb-uuid")
  })

  it("does not show self-calls as outgoing dependencies", () => {
    const sd = makeSeqDiagram(
      "component compA\ncomponent compB\ncompA ->> compA: IFoo:doSomething(id: string)",
    )
    const root = makeRoot([sd])
    const result = buildComponentClassDiagram(getCompA(root), root)
    // compA calling its own interface should not appear as a dependency
    expect(result.mermaidContent).not.toContain("compA ..> compA")
  })

  it("does not deduplicate: each unique interface call creates one arrow", () => {
    const sd = makeSeqDiagram(
      [
        "component compA",
        "component compB",
        "compA ->> compB: IBaz:process(data: string)",
        "compA ->> compB: IBaz:process(data: string)",
      ].join("\n"),
    )
    const root = makeRootWithCompBInterfaces([sd])
    const result = buildComponentClassDiagram(getCompA(root), root)
    // IBaz interface class should appear exactly once
    const matches = (result.mermaidContent.match(/class IBaz/g) ?? []).length
    expect(matches).toBe(1)
  })

  it("shows both dependents and dependencies together", () => {
    // user calls compA (dependent); compA calls compB (dependency)
    const sdIncoming = makeSeqDiagram(
      "actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething(id: string)",
    )
    const sdOutgoing = makeSeqDiagram(
      "component compA\ncomponent compB\ncompA ->> compB: IBaz:process(data: string)",
    )
    const root = makeRootWithCompBInterfaces([sdIncoming, sdOutgoing])
    const result = buildComponentClassDiagram(getCompA(root), root)
    // dependents section
    expect(result.mermaidContent).toContain("user ..> IFoo")
    // dependencies section
    expect(result.mermaidContent).toContain("compA ..> IBaz")
    // no direct component arrow since interface arrow exists
    expect(result.mermaidContent).not.toContain("compA ..> compB")
  })
})
