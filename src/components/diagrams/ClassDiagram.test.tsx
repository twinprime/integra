// @vitest-environment jsdom
/**
 * Tests for ComponentClassDiagram and UseCaseClassDiagram — specifically that
 * when mermaid fails to render, the generated mermaid source is shown in a
 * <pre> block rather than an empty div.
 */
import { describe, it, expect, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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

function makeHookState(overrides: Record<string, unknown> = {}) {
  return {
    svg: "",
    error: "",
    mermaidSource: "",
    elementRef: makeRef(),
    handleDiagramClick: vi.fn(),
    handleDiagramMouseMove: vi.fn(),
    handleDiagramMouseLeave: vi.fn(),
    activeSequenceDiagrams: [],
    activePopupPosition: null,
    isPopupPinned: false,
    clearActiveSequenceDiagrams: vi.fn(),
    selectSequenceDiagram: vi.fn(),
    handlePopupMouseEnter: vi.fn(),
    handlePopupMouseLeave: vi.fn(),
    ...overrides,
  }
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
    mockUseCompClass.mockReturnValue(makeHookState({ error: "Invalid Diagram Syntax", mermaidSource: MERMAID_SOURCE }))
    render(<ComponentClassDiagram componentNode={makeCompNode()} />)

    const pre = document.querySelector("pre")
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toContain(MERMAID_SOURCE)
  })

  it("does NOT show <pre> when mermaid renders successfully", () => {
    mockUseCompClass.mockReturnValue(makeHookState({ svg: "<svg>ok</svg>" }))
    render(<ComponentClassDiagram componentNode={makeCompNode()} />)

    expect(document.querySelector("pre")).toBeNull()
    expect(screen.getByTestId("diagram-svg-container")).toBeTruthy()
  })

  it("does NOT show <pre> when error occurs but mermaidSource is empty", () => {
    mockUseCompClass.mockReturnValue(makeHookState({ error: "some error" }))
    render(<ComponentClassDiagram componentNode={makeCompNode()} />)

    expect(document.querySelector("pre")).toBeNull()
  })

  it("shows 'No interfaces defined' when component has no interfaces and no error", () => {
    mockUseCompClass.mockReturnValue(makeHookState())
    render(<ComponentClassDiagram componentNode={makeCompNode(false)} />)

    expect(screen.getByText(/No interfaces defined/i)).toBeTruthy()
    expect(document.querySelector("pre")).toBeNull()
  })

  it("does not show the empty-state message when dependency-only diagram source is available", () => {
    mockUseCompClass.mockReturnValue({
      ...makeHookState(),
      mermaidSource: "classDiagram\n  class comp\n  class IOrder\n  comp ..> IOrder",
    })
    render(<ComponentClassDiagram componentNode={makeCompNode(false)} />)

    expect(screen.queryByText(/No interfaces defined/i)).toBeNull()
  })

  it("shows dependency source popup when the hook exposes sequence diagrams", () => {
    mockUseCompClass.mockReturnValue(
      makeHookState({
        svg: "<svg>ok</svg>",
        activeSequenceDiagrams: [{ uuid: "seq-1", name: "Checkout Flow" }],
        activePopupPosition: { x: 100, y: 120 },
      }),
    )
    render(<ComponentClassDiagram componentNode={makeCompNode()} />)

    expect(screen.getByText("Derived from sequence diagrams")).toBeInTheDocument()
    expect(screen.getByText("Checkout Flow")).toBeInTheDocument()
  })

  it("routes popup actions back to the hook callbacks", async () => {
    const user = userEvent.setup()
    const clearActiveSequenceDiagrams = vi.fn()
    const selectSequenceDiagram = vi.fn()
    mockUseCompClass.mockReturnValue(
      makeHookState({
        svg: "<svg>ok</svg>",
        activeSequenceDiagrams: [{ uuid: "seq-1", name: "Checkout Flow" }],
        activePopupPosition: { x: 100, y: 120 },
        isPopupPinned: true,
        clearActiveSequenceDiagrams,
        selectSequenceDiagram,
      }),
    )
    render(<ComponentClassDiagram componentNode={makeCompNode()} />)

    await user.click(screen.getByText("Checkout Flow"))
    expect(selectSequenceDiagram).toHaveBeenCalledWith("seq-1")

    await user.click(screen.getByText("Close"))
    expect(clearActiveSequenceDiagrams).toHaveBeenCalled()
  })

  it("passes hover handlers to the diagram container", () => {
    const handleDiagramMouseMove = vi.fn()
    const handleDiagramMouseLeave = vi.fn()
    mockUseCompClass.mockReturnValue(
      makeHookState({
        svg: "<svg>ok</svg>",
        handleDiagramMouseMove,
        handleDiagramMouseLeave,
      }),
    )
    render(<ComponentClassDiagram componentNode={makeCompNode()} />)

    fireEvent.mouseMove(screen.getByTestId("diagram-svg-container"))
    fireEvent.mouseLeave(screen.getByTestId("diagram-svg-container"))
    expect(handleDiagramMouseMove).toHaveBeenCalled()
    expect(handleDiagramMouseLeave).toHaveBeenCalled()
  })
})

// ─── UseCaseClassDiagram ──────────────────────────────────────────────────────

describe("UseCaseClassDiagram — error display", () => {
  it("shows mermaid source in <pre> when svg is empty and error is set", () => {
    mockUseUcClass.mockReturnValue(makeHookState({ error: "Invalid Diagram Syntax", mermaidSource: MERMAID_SOURCE }))
    render(<UseCaseClassDiagram useCaseNode={makeUseCaseNode()} />)

    const pre = document.querySelector("pre")
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toContain(MERMAID_SOURCE)
  })

  it("does NOT show <pre> when mermaid renders successfully", () => {
    mockUseUcClass.mockReturnValue(makeHookState({ svg: "<svg>ok</svg>" }))
    render(<UseCaseClassDiagram useCaseNode={makeUseCaseNode()} />)

    expect(document.querySelector("pre")).toBeNull()
    expect(screen.getByTestId("diagram-svg-container")).toBeTruthy()
  })

  it("does NOT show <pre> when error occurs but mermaidSource is empty", () => {
    mockUseUcClass.mockReturnValue(makeHookState({ error: "some error" }))
    render(<UseCaseClassDiagram useCaseNode={makeUseCaseNode()} />)

    expect(document.querySelector("pre")).toBeNull()
  })

  it("shows 'No sequence diagrams defined' when use case has no sequences", () => {
    render(<UseCaseClassDiagram useCaseNode={makeUseCaseNode(false)} />)
    expect(screen.getByText(/No sequence diagrams defined/i)).toBeTruthy()
    expect(document.querySelector("pre")).toBeNull()
  })
})
