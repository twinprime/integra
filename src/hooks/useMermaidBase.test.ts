import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useMermaidBase } from "./useMermaidBase"
import type { UseCaseDiagramNode, ComponentNode } from "../store/types"

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: "<svg>test</svg>", bindFunctions: undefined }),
  },
}))

vi.mock("../store/useSystemStore", () => ({
  useSystemStore: vi.fn(),
}))

vi.mock("../nodes/nodeTree", () => ({
  findNode: vi.fn(),
}))

import mermaid from "mermaid"
import { useSystemStore } from "../store/useSystemStore"
import { findNode } from "../nodes/nodeTree"

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
  uuid: "diag-uuid",
  id: "diag",
  name: "Test Diagram",
  type: "use-case-diagram",
  content: "actor A\nusecase B",
  referencedNodeIds: [],
  ownerComponentUuid: "root-uuid",
  useCases: [],
}

const mockBuildContent = vi.fn().mockReturnValue({
  mermaidContent: "graph TD\n  A --> B",
  idToUuid: { A: "uuid-a", B: "uuid-b" },
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useMermaidBase", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSystemStore).mockImplementation((selector: (s: unknown) => unknown) =>
      selector({ rootComponent: mockRootComponent, selectNode: mockSelectNode }),
    )
    vi.mocked(findNode).mockReturnValue(mockRootComponent)
    vi.mocked(mermaid.render).mockResolvedValue({ svg: "<svg>test</svg>", bindFunctions: undefined })
    mockBuildContent.mockReturnValue({ mermaidContent: "graph TD\n  A --> B", idToUuid: { A: "uuid-a" } })
  })

  it("returns SVG string on successful render", async () => {
    const { result } = renderHook(() => useMermaidBase(mockDiagramNode, mockBuildContent))

    await waitFor(() => {
      expect(result.current.svg).toBe("<svg>test</svg>")
    })
    expect(result.current.error).toBe("")
    expect(result.current.errorDetails).toBe("")
  })

  it("returns error state when mermaid.render throws", async () => {
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error("Parse error"))

    const { result } = renderHook(() => useMermaidBase(mockDiagramNode, mockBuildContent))

    await waitFor(() => {
      expect(result.current.error).toBe("Invalid Diagram Syntax")
    })
    expect(result.current.errorDetails).toBe("Parse error")
    expect(result.current.svg).toBe("")
  })

  it("calls mermaid.render with the mermaidContent returned by buildContent", async () => {
    const { result } = renderHook(() => useMermaidBase(mockDiagramNode, mockBuildContent))

    await waitFor(() => expect(result.current.svg).toBe("<svg>test</svg>"))

    expect(mermaid.render).toHaveBeenCalledWith(
      expect.stringMatching(/^mermaid-\d+$/),
      "graph TD\n  A --> B",
    )
  })

  it("does not call mermaid.render when diagramNode is null", async () => {
    renderHook(() => useMermaidBase(null, mockBuildContent))

    await new Promise((r) => setTimeout(r, 20))

    expect(mermaid.render).not.toHaveBeenCalled()
  })

  it("does not call mermaid.render when diagramNode content is empty", async () => {
    const emptyNode = { ...mockDiagramNode, content: "   " }

    const { result } = renderHook(() => useMermaidBase(emptyNode, mockBuildContent))

    await new Promise((r) => setTimeout(r, 20))

    expect(mermaid.render).not.toHaveBeenCalled()
    expect(result.current.svg).toBe("")
    expect(result.current.error).toBe("")
  })

  it("re-renders and fetches new SVG when diagramNode content changes", async () => {
    let diagramNode = mockDiagramNode

    const { result, rerender } = renderHook(() => useMermaidBase(diagramNode, mockBuildContent))

    await waitFor(() => expect(result.current.svg).toBe("<svg>test</svg>"))

    vi.mocked(mermaid.render).mockResolvedValueOnce({ svg: "<svg>updated</svg>", bindFunctions: undefined })
    mockBuildContent.mockReturnValueOnce({ mermaidContent: "graph TD\n  C --> D", idToUuid: {} })

    diagramNode = { ...mockDiagramNode, content: "updated content" }
    rerender()

    await waitFor(() => expect(result.current.svg).toBe("<svg>updated</svg>"))
  })

  it("exposes elementRef and selectNode in return value", () => {
    const { result } = renderHook(() => useMermaidBase(null, mockBuildContent))

    expect(result.current.elementRef).toBeDefined()
    expect(result.current.selectNode).toBe(mockSelectNode)
  })

  it("sets window.__integraIdMap from buildContent idToUuid", async () => {
    mockBuildContent.mockReturnValueOnce({
      mermaidContent: "graph TD\n  X --> Y",
      idToUuid: { X: "uuid-x", Y: "uuid-y" },
    })

    const { result } = renderHook(() => useMermaidBase(mockDiagramNode, mockBuildContent))

    await waitFor(() => expect(result.current.svg).toBe("<svg>test</svg>"))

    expect(window.__integraIdMap).toEqual({ X: "uuid-x", Y: "uuid-y" })
  })
})
