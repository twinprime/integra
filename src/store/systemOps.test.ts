import { describe, it, expect } from "vitest"
import {
  rebuildSystemDiagrams,
  stripExclusiveFunctionContributions,
  tryReparseContent,
} from "./systemOps"
import type { ComponentNode } from "./types"

// ── Shared fixtures ───────────────────────────────────────────────────────────

const FN_UUID = "fn-uuid"
const COMP_UUID = "comp-uuid"
const UC_DIAG_UUID = "uc-diag-uuid"
const UC_UUID = "uc-uuid"
const SEQ_UUID = "seq-uuid"
const OTHER_SEQ_UUID = "other-seq-uuid"

function makeBaseSystem(overrides?: Partial<ComponentNode>): ComponentNode {
  return {
    uuid: "root-uuid",
    id: "root",
    name: "My System",
    type: "component",
    description: "",
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
    ...overrides,
  }
}

/** A system with one comp → ucDiagram → useCase → seqDiagram */
function makeSystemWithSeqDiagram(
  seqContent: string,
  seqOwner = COMP_UUID,
): ComponentNode {
  return makeBaseSystem({
    subComponents: [
      {
        uuid: COMP_UUID,
        id: "comp",
        name: "comp",
        type: "component",
        description: "",
        subComponents: [],
        actors: [],
        interfaces: [],
        useCaseDiagrams: [
          {
            uuid: UC_DIAG_UUID,
            id: "ucd1",
            name: "UC Diag",
            type: "use-case-diagram",
            content: "",
            ownerComponentUuid: COMP_UUID,
            referencedNodeIds: [],
            useCases: [
              {
                uuid: UC_UUID,
                id: "uc1",
                name: "Use Case",
                type: "use-case",
                sequenceDiagrams: [
                  {
                    uuid: SEQ_UUID,
                    id: "seq1",
                    name: "Seq",
                    type: "sequence-diagram",
                    content: seqContent,
                    ownerComponentUuid: seqOwner,
                    referencedNodeIds: [],
                    referencedFunctionUuids: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  })
}

/** A system with a use-case-diagram that has NO ownerComponentUuid set */
function makeSystemWithUnownedDiagram(): ComponentNode {
  return makeBaseSystem({
    subComponents: [
      {
        uuid: COMP_UUID,
        id: "comp1",
        name: "comp",
        type: "component",
        description: "",
        subComponents: [],
        actors: [],
        interfaces: [],
        useCaseDiagrams: [
          {
            uuid: UC_DIAG_UUID,
            id: "ucd1",
            name: "UC Diag",
            type: "use-case-diagram",
            content: "",
            ownerComponentUuid: "", // intentionally unset / falsy
            referencedNodeIds: [],
            useCases: [],
          },
        ],
      },
    ],
  })
}

/** A system where FN_UUID is referenced by two sequence diagrams */
function makeSystemWithSharedFn(): ComponentNode {
  return makeBaseSystem({
    subComponents: [
      {
        uuid: COMP_UUID,
        id: "comp1",
        name: "comp",
        type: "component",
        description: "",
        subComponents: [],
        actors: [],
        interfaces: [
          {
            uuid: "iface-uuid",
            id: "API",
            name: "API",
            type: "rest",
            functions: [
              {
                uuid: FN_UUID,
                id: "fn",
                parameters: [{ name: "id", type: "number", required: true }],
              },
            ],
          },
        ],
        useCaseDiagrams: [
          {
            uuid: UC_DIAG_UUID,
            id: "ucd1",
            name: "UC Diag",
            type: "use-case-diagram",
            content: "",
            ownerComponentUuid: COMP_UUID,
            referencedNodeIds: [],
            useCases: [
              {
                uuid: UC_UUID,
                id: "uc1",
                name: "Use Case",
                type: "use-case",
                sequenceDiagrams: [
                  {
                    uuid: SEQ_UUID,
                    id: "seq1",
                    name: "Target Diagram",
                    type: "sequence-diagram",
                    content: "",
                    ownerComponentUuid: COMP_UUID,
                    referencedNodeIds: [],
                    referencedFunctionUuids: [FN_UUID],
                  },
                  {
                    uuid: OTHER_SEQ_UUID,
                    id: "seq2",
                    name: "Other Diagram",
                    type: "sequence-diagram",
                    content: "",
                    ownerComponentUuid: COMP_UUID,
                    referencedNodeIds: [],
                    referencedFunctionUuids: [FN_UUID],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  })
}

/** Same as above but OTHER_SEQ_UUID does NOT reference FN_UUID */
function makeSystemWithExclusiveFn(): ComponentNode {
  const base = makeSystemWithSharedFn()
  const comp = base.subComponents[0]
  const ucDiag = comp.useCaseDiagrams[0]
  const uc = ucDiag.useCases[0]
  const otherSeq = { ...uc.sequenceDiagrams[1], referencedFunctionUuids: [] }
  return {
    ...base,
    subComponents: [
      {
        ...comp,
        useCaseDiagrams: [
          {
            ...ucDiag,
            useCases: [
              { ...uc, sequenceDiagrams: [uc.sequenceDiagrams[0], otherSeq] },
            ],
          },
        ],
      },
    ],
  }
}

// ── rebuildSystemDiagrams ─────────────────────────────────────────────────────

describe("rebuildSystemDiagrams", () => {
  it("sets ownerComponentUuid on a diagram node that has no owner", () => {
    const system = makeSystemWithUnownedDiagram()
    const result = rebuildSystemDiagrams(system)

    const diag = result.subComponents[0].useCaseDiagrams[0]
    expect(diag.ownerComponentUuid).toBe(COMP_UUID)
  })

  it("parses sequence diagram content and updates the component tree", () => {
    const content = "component comp\ncomp ->> comp: MyIface:doWork(x: string)"
    const system = makeSystemWithSeqDiagram(content)

    const result = rebuildSystemDiagrams(system)

    // The parser should have added an interface to the comp sub-component
    const comp = result.subComponents[0]
    expect(comp.interfaces.length).toBeGreaterThan(0)
  })

  it("silently ignores parse errors in sequence diagrams", () => {
    const invalidContent = "@@@@invalid content@@@@"
    const system = makeSystemWithSeqDiagram(invalidContent)

    expect(() => rebuildSystemDiagrams(system)).not.toThrow()
  })
})

// ── stripExclusiveFunctionContributions ──────────────────────────────────────

describe("stripExclusiveFunctionContributions", () => {
  it("removes a function UUID from interfaces when it is only referenced by the target diagram", () => {
    const system = makeSystemWithExclusiveFn()

    const result = stripExclusiveFunctionContributions(system, SEQ_UUID)

    const fns = result.subComponents[0].interfaces[0]?.functions ?? []
    const fnUuids = fns.map((f) => f.uuid)
    expect(fnUuids).not.toContain(FN_UUID)
  })

  it("keeps a function UUID when it is also referenced by another diagram", () => {
    const system = makeSystemWithSharedFn()

    const result = stripExclusiveFunctionContributions(system, SEQ_UUID)

    const fns = result.subComponents[0].interfaces[0]?.functions ?? []
    const fnUuids = fns.map((f) => f.uuid)
    expect(fnUuids).toContain(FN_UUID)
  })
})

// ── tryReparseContent ─────────────────────────────────────────────────────────

describe("tryReparseContent", () => {
  it("returns { rootComponent: system } unchanged for a non-diagram node uuid", () => {
    const system = makeSystemWithSeqDiagram("")
    const result = tryReparseContent("some content", system, COMP_UUID)

    expect(result.rootComponent).toBe(system)
    expect(result.parseError).toBeUndefined()
  })

  it("returns updated rootComponent and parseError: null for valid sequence diagram content", () => {
    const initialContent = ""
    const system = makeSystemWithSeqDiagram(initialContent)

    const validContent = "component comp\ncomp ->> comp: MyIface:doWork(x: string)"
    const result = tryReparseContent(validContent, system, SEQ_UUID)

    expect(result.parseError).toBeNull()
    expect(result.rootComponent).toBeDefined()
    expect(result.rootComponent).not.toBe(system)
  })

  it("returns { parseError: <message> } and leaves rootComponent unchanged for invalid content", () => {
    const system = makeSystemWithSeqDiagram("")

    const result = tryReparseContent("@@@@invalid@@@@", system, SEQ_UUID)

    expect(typeof result.parseError).toBe("string")
    expect(result.rootComponent).toBeUndefined()
  })
})
