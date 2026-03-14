import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useUseCaseDiagram } from "./useUseCaseDiagram"
import type { UseCaseDiagramNode, ComponentNode } from "../store/types"
import type { SystemState } from "../store/useSystemStore"
import type { RenderResult } from "mermaid"

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: "<svg>uc</svg>", bindFunctions: vi.fn() }),
  },
}))

vi.mock("../store/useSystemStore", () => ({
  useSystemStore: vi.fn(),
}))

vi.mock("../nodes/nodeTree", () => ({
  findNode: vi.fn(),
}))

vi.mock("../parser/useCaseDiagram/mermaidGenerator", () => ({
  generateUseCaseMermaid: vi.fn().mockReturnValue({
    mermaidContent: "graph TD\n  Actor --> UseCase",
    idToUuid: { Actor: "actor-uuid", UseCase: "uc-uuid" },
  }),
}))

import mermaid from "mermaid"
import { useSystemStore } from "../store/useSystemStore"
import { findNode } from "../nodes/nodeTree"
import { generateUseCaseMermaid } from "../parser/useCaseDiagram/mermaidGenerator"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockSelectNode = vi.fn()

const mockRootComponent: ComponentNode = {
  uuid: "root-uuid",
  id: "root",
  name: "Root",
  type: "component",
  subComponents: [],
  actors: [],
  useCaseDiagrams: [],
  interfaces: [],
}

const mockDiagramNode: UseCaseDiagramNode = {
  uuid: "ucd-uuid",
  id: "ucd",
  name: "UC Diagram",
  type: "use-case-diagram",
  content: "actor Admin\nusecase Login",
  referencedNodeIds: [],
  ownerComponentUuid: "root-uuid",
  useCases: [],
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useUseCaseDiagram", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSystemStore).mockImplementation((selector: (s: SystemState) => unknown) =>
      selector({ rootComponent: mockRootComponent, selectNode: mockSelectNode } as unknown as SystemState),
    )
    vi.mocked(findNode).mockReturnValue(mockRootComponent)
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: "<svg>uc</svg>",
      diagramType: "graph",
      bindFunctions: vi.fn(),
    } satisfies RenderResult)
    vi.mocked(generateUseCaseMermaid).mockReturnValue({
      mermaidContent: "graph TD\n  Actor --> UseCase",
      idToUuid: { Actor: "actor-uuid", UseCase: "uc-uuid" },
    })
  })

  it("returns expected shape: svg, error, errorDetails, mermaidSource, elementRef", () => {
    const { result } = renderHook(() => useUseCaseDiagram(null))

    expect(result.current).toHaveProperty("svg")
    expect(result.current).toHaveProperty("error")
    expect(result.current).toHaveProperty("errorDetails")
    expect(result.current).toHaveProperty("mermaidSource")
    expect(result.current).toHaveProperty("elementRef")
  })

  it("returns SVG after successful render", async () => {
    const { result } = renderHook(() => useUseCaseDiagram(mockDiagramNode))

    await waitFor(() => expect(result.current.svg).toBe("<svg>uc</svg>"))
    expect(result.current.error).toBe("")
  })

  it("calls generateUseCaseMermaid with diagram content and root component", async () => {
    const { result } = renderHook(() => useUseCaseDiagram(mockDiagramNode))

    await waitFor(() => expect(result.current.svg).toBe("<svg>uc</svg>"))

    expect(generateUseCaseMermaid).toHaveBeenCalledWith(
      mockDiagramNode.content,
      expect.anything(),
      mockRootComponent,
    )
  })

  it("returns error state when mermaid.render throws", async () => {
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error("Diagram parse error"))

    const { result } = renderHook(() => useUseCaseDiagram(mockDiagramNode))

    await waitFor(() => expect(result.current.error).toBe("Invalid Diagram Syntax"))
    expect(result.current.svg).toBe("")
  })

  it("returns empty state when diagramNode is null", async () => {
    const { result } = renderHook(() => useUseCaseDiagram(null))

    await new Promise((r) => setTimeout(r, 20))

    expect(result.current.svg).toBe("")
    expect(result.current.error).toBe("")
    expect(mermaid.render).not.toHaveBeenCalled()
  })
})
