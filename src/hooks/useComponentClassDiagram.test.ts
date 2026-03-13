import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useComponentClassDiagram } from "./useComponentClassDiagram"
import type { ComponentNode } from "../store/types"

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: "<svg>comp-class</svg>", bindFunctions: undefined }),
  },
}))

vi.mock("../store/useSystemStore", () => ({
  useSystemStore: vi.fn(),
}))

vi.mock("../utils/componentClassDiagram", () => ({
  buildComponentClassDiagram: vi.fn().mockReturnValue({
    mermaidContent: "classDiagram\n  class MyComp",
    idToUuid: { MyComp: "comp-uuid" },
  }),
}))

import mermaid from "mermaid"
import { useSystemStore } from "../store/useSystemStore"
import { buildComponentClassDiagram } from "../utils/componentClassDiagram"

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

const mockComponentNode: ComponentNode = {
  uuid: "comp-uuid",
  id: "MyComp",
  name: "My Component",
  type: "component",
  subComponents: [],
  actors: [],
  useCaseDiagrams: [],
  interfaces: [
    {
      uuid: "iface-uuid",
      id: "IFoo",
      name: "IFoo",
      type: "rest",
      functions: [],
    },
  ],
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useComponentClassDiagram", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSystemStore).mockImplementation((selector: (s: unknown) => unknown) =>
      selector({ rootComponent: mockRootComponent, selectNode: mockSelectNode }),
    )
    vi.mocked(mermaid.render).mockResolvedValue({ svg: "<svg>comp-class</svg>", bindFunctions: undefined })
    vi.mocked(buildComponentClassDiagram).mockReturnValue({
      mermaidContent: "classDiagram\n  class MyComp",
      idToUuid: { MyComp: "comp-uuid" },
    })
  })

  it("returns expected shape: svg, error, mermaidSource, elementRef", () => {
    const { result } = renderHook(() => useComponentClassDiagram(null))

    expect(result.current).toHaveProperty("svg")
    expect(result.current).toHaveProperty("error")
    expect(result.current).toHaveProperty("mermaidSource")
    expect(result.current).toHaveProperty("elementRef")
  })

  it("returns SVG when componentNode is provided", async () => {
    const { result } = renderHook(() => useComponentClassDiagram(mockComponentNode))

    await waitFor(() => expect(result.current.svg).toBe("<svg>comp-class</svg>"))
    expect(result.current.error).toBe("")
  })

  it("delegates to buildComponentClassDiagram build function", async () => {
    const { result } = renderHook(() => useComponentClassDiagram(mockComponentNode))

    await waitFor(() => expect(result.current.svg).toBe("<svg>comp-class</svg>"))

    expect(buildComponentClassDiagram).toHaveBeenCalledWith(mockComponentNode, mockRootComponent)
  })

  it("uses comp-class idPrefix in the mermaid render element id", async () => {
    const { result } = renderHook(() => useComponentClassDiagram(mockComponentNode))

    await waitFor(() => expect(result.current.svg).toBe("<svg>comp-class</svg>"))

    expect(mermaid.render).toHaveBeenCalledWith(
      expect.stringMatching(/^mermaid-comp-class-\d+$/),
      expect.any(String),
    )
  })

  it("returns empty state when componentNode is null", async () => {
    const { result } = renderHook(() => useComponentClassDiagram(null))

    await new Promise((r) => setTimeout(r, 20))

    expect(result.current.svg).toBe("")
    expect(mermaid.render).not.toHaveBeenCalled()
  })

  it("returns error when mermaid.render throws", async () => {
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error("Class diagram error"))

    const { result } = renderHook(() => useComponentClassDiagram(mockComponentNode))

    await waitFor(() => expect(result.current.error).toBe("Class diagram error"))
    expect(result.current.svg).toBe("")
  })
})
