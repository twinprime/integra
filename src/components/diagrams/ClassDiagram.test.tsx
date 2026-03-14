// @vitest-environment jsdom
/**
 * Tests for ComponentClassDiagram and UseCaseClassDiagram — specifically that
 * when mermaid fails to render, the generated mermaid source is shown in a
 * <pre> block rather than an empty div.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ComponentClassDiagram } from "./ComponentClassDiagram"
import { UseCaseClassDiagram } from "./UseCaseClassDiagram"
import type { ComponentNode, UseCaseNode, InterfaceSpecification, SequenceDiagramNode } from "../../store/types"

// ─── Mock the hooks ───────────────────────────────────────────────────────────

vi.mock("../../hooks/useComponentClassDiagram", () => ({
  useComponentClassDiagram: vi.fn(),
}))
vi.mock("../../hooks/useUseCaseClassDiagram", () => ({
  useUseCaseClassDiagram: vi.fn(),
}))

import { useComponentClassDiagram } from "../../hooks/useComponentClassDiagram"
import { useUseCaseClassDiagram } from "../../hooks/useUseCaseClassDiagram"
const mockUseCompClass = useComponentClassDiagram as ReturnType<typeof vi.fn>
const mockUseUcClass = useUseCaseClassDiagram as ReturnType<typeof vi.fn>

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRef() {
  return { current: null }
}

const MERMAID_SOURCE = "classDiagram\n  class Foo"

const makeCompNode = (withInterface = true): ComponentNode => ({
  uuid: "comp-uuid",
  id: "comp",
  name: "My Component",
  type: "component",
  subComponents: [],
  actors: [],
  useCaseDiagrams: [],
  interfaces: withInterface
    ? [{ uuid: "iface-uuid", id: "IFoo", name: "IFoo", type: "rest", functions: [] } as InterfaceSpecification]
    : [],
})

const makeUseCaseNode = (withSeq = true): UseCaseNode => ({
  uuid: "uc-uuid",
  id: "uc",
  name: "My Use Case",
  type: "use-case",
  sequenceDiagrams: withSeq
    ? [{ uuid: "seq-uuid", id: "seq", name: "Seq", type: "sequence-diagram", content: "", description: "", ownerComponentUuid: "comp-uuid", referencedNodeIds: [], referencedFunctionUuids: [] } as SequenceDiagramNode]
    : [],
})

// ─── ComponentClassDiagram ────────────────────────────────────────────────────

describe("ComponentClassDiagram — error display", () => {
  it("shows mermaid source in <pre> when svg is empty and error is set", () => {
    mockUseCompClass.mockReturnValue({ svg: "", error: "Invalid Diagram Syntax", mermaidSource: MERMAID_SOURCE, elementRef: makeRef() })
    render(<ComponentClassDiagram componentNode={makeCompNode()} />)

    const pre = document.querySelector("pre")
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toContain(MERMAID_SOURCE)
  })

  it("does NOT show <pre> when mermaid renders successfully", () => {
    mockUseCompClass.mockReturnValue({ svg: "<svg>ok</svg>", error: "", mermaidSource: "", elementRef: makeRef() })
    render(<ComponentClassDiagram componentNode={makeCompNode()} />)

    expect(document.querySelector("pre")).toBeNull()
    expect(screen.getByTestId("diagram-svg-container")).toBeTruthy()
  })

  it("does NOT show <pre> when error occurs but mermaidSource is empty", () => {
    mockUseCompClass.mockReturnValue({ svg: "", error: "some error", mermaidSource: "", elementRef: makeRef() })
    render(<ComponentClassDiagram componentNode={makeCompNode()} />)

    expect(document.querySelector("pre")).toBeNull()
  })

  it("shows 'No interfaces defined' when component has no interfaces and no error", () => {
    mockUseCompClass.mockReturnValue({ svg: "", error: "", mermaidSource: "", elementRef: makeRef() })
    render(<ComponentClassDiagram componentNode={makeCompNode(false)} />)

    expect(screen.getByText(/No interfaces defined/i)).toBeTruthy()
    expect(document.querySelector("pre")).toBeNull()
  })

  it("does not show the empty-state message when dependency-only diagram source is available", () => {
    mockUseCompClass.mockReturnValue({
      svg: "",
      error: "",
      mermaidSource: "classDiagram\n  class comp\n  class IOrder\n  comp ..> IOrder",
      elementRef: makeRef(),
    })
    render(<ComponentClassDiagram componentNode={makeCompNode(false)} />)

    expect(screen.queryByText(/No interfaces defined/i)).toBeNull()
  })
})

// ─── UseCaseClassDiagram ──────────────────────────────────────────────────────

describe("UseCaseClassDiagram — error display", () => {
  it("shows mermaid source in <pre> when svg is empty and error is set", () => {
    mockUseUcClass.mockReturnValue({ svg: "", error: "Invalid Diagram Syntax", mermaidSource: MERMAID_SOURCE, elementRef: makeRef() })
    render(<UseCaseClassDiagram useCaseNode={makeUseCaseNode()} />)

    const pre = document.querySelector("pre")
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toContain(MERMAID_SOURCE)
  })

  it("does NOT show <pre> when mermaid renders successfully", () => {
    mockUseUcClass.mockReturnValue({ svg: "<svg>ok</svg>", error: "", mermaidSource: "", elementRef: makeRef() })
    render(<UseCaseClassDiagram useCaseNode={makeUseCaseNode()} />)

    expect(document.querySelector("pre")).toBeNull()
    expect(screen.getByTestId("diagram-svg-container")).toBeTruthy()
  })

  it("does NOT show <pre> when error occurs but mermaidSource is empty", () => {
    mockUseUcClass.mockReturnValue({ svg: "", error: "some error", mermaidSource: "", elementRef: makeRef() })
    render(<UseCaseClassDiagram useCaseNode={makeUseCaseNode()} />)

    expect(document.querySelector("pre")).toBeNull()
  })

  it("shows 'No sequence diagrams defined' when use case has no sequences", () => {
    render(<UseCaseClassDiagram useCaseNode={makeUseCaseNode(false)} />)
    expect(screen.getByText(/No sequence diagrams defined/i)).toBeTruthy()
    expect(document.querySelector("pre")).toBeNull()
  })
})
