import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useUseCaseClassDiagram } from "./useUseCaseClassDiagram"
import type { UseCaseNode, ComponentNode } from "../store/types"
import type { SystemState } from "../store/useSystemStore"
import type { RenderResult } from "mermaid"

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: "<svg>uc-class</svg>", bindFunctions: undefined }),
  },
}))

vi.mock("../store/useSystemStore", () => ({
  useSystemStore: vi.fn(),
}))

vi.mock("../utils/useCaseClassDiagram", () => ({
  buildUseCaseClassDiagram: vi.fn().mockReturnValue({
    mermaidContent: "classDiagram\n  class UC",
    idToUuid: { UC: "uc-uuid" },
    relationshipMetadata: [],
  }),
}))

import mermaid from "mermaid"
import { useSystemStore } from "../store/useSystemStore"
import { buildUseCaseClassDiagram } from "../utils/useCaseClassDiagram"

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

const mockUseCaseNode: UseCaseNode = {
  uuid: "uc-uuid",
  id: "uc",
  name: "My Use Case",
  type: "use-case",
  sequenceDiagrams: [],
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useUseCaseClassDiagram", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSystemStore).mockImplementation((selector: (s: SystemState) => unknown) =>
      selector({ rootComponent: mockRootComponent, selectNode: mockSelectNode } as unknown as SystemState),
    )
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: "<svg>uc-class</svg>",
      diagramType: "classDiagram",
      bindFunctions: undefined,
    } satisfies RenderResult)
    vi.mocked(buildUseCaseClassDiagram).mockReturnValue({
      mermaidContent: "classDiagram\n  class UC",
      idToUuid: { UC: "uc-uuid" },
      relationshipMetadata: [],
    })
  })

  it("returns expected shape: svg, error, mermaidSource, elementRef", () => {
    const { result } = renderHook(() => useUseCaseClassDiagram(null))

    expect(result.current).toHaveProperty("svg")
    expect(result.current).toHaveProperty("error")
    expect(result.current).toHaveProperty("mermaidSource")
    expect(result.current).toHaveProperty("elementRef")
  })

  it("returns SVG when useCaseNode is provided", async () => {
    const { result } = renderHook(() => useUseCaseClassDiagram(mockUseCaseNode))

    await waitFor(() => expect(result.current.svg).toBe("<svg>uc-class</svg>"))
    expect(result.current.error).toBe("")
  })

  it("delegates to buildUseCaseClassDiagram build function", async () => {
    const { result } = renderHook(() => useUseCaseClassDiagram(mockUseCaseNode))

    await waitFor(() => expect(result.current.svg).toBe("<svg>uc-class</svg>"))

    expect(buildUseCaseClassDiagram).toHaveBeenCalledWith(mockUseCaseNode, mockRootComponent)
  })

  it("uses uc-class idPrefix in the mermaid render element id", async () => {
    const { result } = renderHook(() => useUseCaseClassDiagram(mockUseCaseNode))

    await waitFor(() => expect(result.current.svg).toBe("<svg>uc-class</svg>"))

    expect(mermaid.render).toHaveBeenCalledWith(
      expect.stringMatching(/^mermaid-uc-class-\d+$/),
      expect.any(String),
    )
  })

  it("returns empty state when useCaseNode is null", async () => {
    const { result } = renderHook(() => useUseCaseClassDiagram(null))

    await new Promise((r) => setTimeout(r, 20))

    expect(result.current.svg).toBe("")
    expect(mermaid.render).not.toHaveBeenCalled()
  })
})
