// @vitest-environment node
import { describe, expect, it } from "vitest"
import { buildComponentClassDiagram } from "./componentClassDiagram"
import {
  getPlatform,
  getNestedCompA,
  makeNestedRootWithAncestorSibling,
  makeSeqDiagram,
} from "./componentClassDiagram.test.fixtures"

describe("buildComponentClassDiagram ancestor sibling scope", () => {
  it("includes outbound dependencies to a sibling of an ancestor component", () => {
    const sd = makeSeqDiagram(
      [
        "component parent/compA as compA",
        "component platform",
        "compA ->> platform: IPlatform:handlePlatform(data: string)",
      ].join("\n"),
    )
    const root = makeNestedRootWithAncestorSibling([sd])
    const result = buildComponentClassDiagram(getNestedCompA(root), root)

    expect(result.mermaidContent).toContain('class IPlatform["IPlatform"] {')
    expect(result.mermaidContent).toContain("+handlePlatform(data: string)")
    expect(result.mermaidContent).toContain("platform ..|> IPlatform")
    expect(result.mermaidContent).toContain("compA ..> IPlatform")
  })

  it("shows inbound dependencies from ancestor siblings as red violations", () => {
    const sd = makeSeqDiagram(
      [
        "component platform",
        "component parent/compA as compA",
        "platform ->> compA: IFoo:doSomething(id: string)",
      ].join("\n"),
    )
    const root = makeNestedRootWithAncestorSibling([sd])
    const result = buildComponentClassDiagram(getNestedCompA(root), root)

    expect(result.mermaidContent).toContain("platform ..> IFoo")
    expect(result.mermaidContent).toContain("style platform fill:#fee2e2,stroke:#dc2626,color:#7f1d1d")
  })

  it("does not mark immediate sibling inbound dependencies as violations", () => {
    const sd = makeSeqDiagram(
      [
        "component parent/compB as compB",
        "component parent/compA as compA",
        "compB ->> compA: IFoo:doSomething(id: string)",
      ].join("\n"),
    )
    const root = makeNestedRootWithAncestorSibling([sd])
    const result = buildComponentClassDiagram(getNestedCompA(root), root)

    expect(result.mermaidContent).toContain("compB ..> IFoo")
    expect(result.mermaidContent).not.toContain("stroke:#dc2626")
    expect(result.mermaidContent).not.toContain("fill:#fee2e2")
  })

  it("excludes a descendant of an ancestor sibling that calls the target", () => {
    const sd = makeSeqDiagram(
      [
        "component platform/platformChild as platformChild",
        "component parent/compA as compA",
        "platformChild ->> compA: IFoo:doSomething(id: string)",
      ].join("\n"),
    )
    const root = makeNestedRootWithAncestorSibling([sd])
    const result = buildComponentClassDiagram(getNestedCompA(root), root)

    expect(result.mermaidContent).not.toContain("platformChild")
    expect(result.mermaidContent).not.toContain("stroke:#dc2626")
    expect(result.mermaidContent).not.toContain("fill:#fee2e2")
  })

  it("excludes a descendant of an ancestor sibling that the target calls out to", () => {
    const sd = makeSeqDiagram(
      [
        "component parent/compA as compA",
        "component platform/platformChild as platformChild",
        "compA ->> platformChild: IPlatformChild:handleChild(value: string)",
      ].join("\n"),
    )
    const root = makeNestedRootWithAncestorSibling([sd])
    const result = buildComponentClassDiagram(getNestedCompA(root), root)

    expect(result.mermaidContent).not.toContain("platformChild")
    expect(result.mermaidContent).not.toContain("IPlatformChild")
  })

  it("shows the immediate sibling ancestor as the inbound dependent in the selected ancestor sibling diagram", () => {
    const sd = makeSeqDiagram(
      [
        "component parent/compA as compA",
        "component platform",
        "compA ->> platform: IPlatform:handlePlatform(data: string)",
      ].join("\n"),
    )
    const root = makeNestedRootWithAncestorSibling([sd])
    const result = buildComponentClassDiagram(getPlatform(root), root)

    expect(result.mermaidContent).toContain('class parent["Parent"]:::component')
    expect(result.mermaidContent).toContain("parent ..> IPlatform")
    expect(result.mermaidContent).not.toContain('class compA["Component A"]:::component')
    expect(result.idToUuid.parent).toBe("parent-uuid")
    expect(result.idToUuid.compA).toBeUndefined()
  })
})
