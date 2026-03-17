// @vitest-environment node
import { describe, expect, it } from "vitest"
import { buildComponentClassDiagram } from "./componentClassDiagram"
import { getCompA, makeRoot, makeSeqDiagram, makeUcd, makeUseCase } from "./componentClassDiagram.test.fixtures"

describe("buildComponentClassDiagram reference traversal", () => {
  it("includes dependencies from referenced sequence diagrams", () => {
    const entrySeq = {
      ...makeSeqDiagram(
        [
          "component compB",
          "component compA",
          "compB ->> compA: Sequence:sharedFlow",
        ].join("\n"),
      ),
      id: "entry",
      uuid: "entry-seq-uuid",
      name: "Entry Seq",
    }
    const sharedSeq = {
      ...makeSeqDiagram(
        [
          "component compB",
          "component compA",
          "compB ->> compA: IFoo:doSomething(id: string)",
        ].join("\n"),
      ),
      id: "sharedFlow",
      uuid: "shared-seq-uuid",
      name: "Shared Flow",
    }

    const root = makeRoot([entrySeq, sharedSeq])
    const result = buildComponentClassDiagram(getCompA(root), root)

    expect(result.mermaidContent).toContain("compB ..> IFoo")
    expect(result.relationshipMetadata).toContainEqual({
      sequenceDiagrams: [{ uuid: "shared-seq-uuid", name: "Shared Flow" }],
    })
  })

  it("includes all sequence diagrams from referenced use cases and avoids cycles", () => {
    const entrySeq = {
      ...makeSeqDiagram(
        [
          "component compB",
          "component compA",
          "compB ->> compA: UseCase:secondary",
        ].join("\n"),
      ),
      id: "entry",
      uuid: "entry-seq-uuid",
      name: "Entry Seq",
    }
    const secondarySeqA = {
      ...makeSeqDiagram(
        [
          "component compB",
          "component compA",
          "compB ->> compA: IFoo:doSomething(id: string)",
        ].join("\n"),
      ),
      id: "secondaryA",
      uuid: "secondary-a-uuid",
      name: "Secondary A",
    }
    const secondarySeqB = {
      ...makeSeqDiagram(
        [
          "component compB",
          "component compA",
          "compB ->> compA: IBar:getAll(page: number?)",
          "compB ->> compA: Sequence:entry",
        ].join("\n"),
      ),
      id: "secondaryB",
      uuid: "secondary-b-uuid",
      name: "Secondary B",
    }

    const root = {
      ...makeRoot(),
      useCaseDiagrams: [
        makeUcd(
          { ...makeUseCase(entrySeq), id: "primary", uuid: "primary-uc-uuid", name: "Primary" },
          {
            ...makeUseCase(secondarySeqA, secondarySeqB),
            id: "secondary",
            uuid: "secondary-uc-uuid",
            name: "Secondary",
          },
        ),
      ],
    }
    const result = buildComponentClassDiagram(getCompA(root), root)

    expect(result.mermaidContent).toContain("compB ..> IFoo")
    expect(result.mermaidContent).toContain("compB ..> IBar")
    expect((result.mermaidContent.match(/compB \.\.> IFoo/g) ?? [])).toHaveLength(1)
    expect(result.relationshipMetadata).toContainEqual({
      sequenceDiagrams: [{ uuid: "secondary-a-uuid", name: "Secondary A" }],
    })
    expect(result.relationshipMetadata).toContainEqual({
      sequenceDiagrams: [{ uuid: "secondary-b-uuid", name: "Secondary B" }],
    })
  })
})
