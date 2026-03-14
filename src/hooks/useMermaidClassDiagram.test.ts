import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useMermaidClassDiagram } from "./useMermaidClassDiagram"
import type { ComponentNode } from "../store/types"
import type { SystemState } from "../store/useSystemStore"
import type { RenderResult } from "mermaid"

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: "<svg>class</svg>", bindFunctions: undefined }),
  },
}))

vi.mock("../store/useSystemStore", () => ({
  useSystemStore: vi.fn(),
}))

import mermaid from "mermaid"
import { useSystemStore } from "../store/useSystemStore"

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

const mockNode: ComponentNode = {
  uuid: "comp-uuid",
  id: "comp",
  name: "MyComp",
  type: "component",
  subComponents: [],
  actors: [],
  useCaseDiagrams: [],
  interfaces: [],
}

const mockBuildFn = vi.fn().mockReturnValue({
  mermaidContent: "classDiagram\n  class Foo",
  idToUuid: { Foo: "uuid-foo" },
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useMermaidClassDiagram", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSystemStore).mockImplementation((selector: (s: SystemState) => unknown) =>
      selector({ rootComponent: mockRootComponent, selectNode: mockSelectNode } as unknown as SystemState),
    )
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: "<svg>class</svg>",
      diagramType: "classDiagram",
      bindFunctions: undefined,
    } satisfies RenderResult)
    mockBuildFn.mockReturnValue({ mermaidContent: "classDiagram\n  class Foo", idToUuid: { Foo: "uuid-foo" } })
  })

  it("returns SVG on successful render", async () => {
    const { result } = renderHook(() =>
      useMermaidClassDiagram(mockBuildFn, mockNode, "test"),
    )

    await waitFor(() => expect(result.current.svg).toBe("<svg>class</svg>"))
    expect(result.current.error).toBe("")
  })

  it("calls buildFn with node and rootComponent", async () => {
    const { result } = renderHook(() =>
      useMermaidClassDiagram(mockBuildFn, mockNode, "test"),
    )

    await waitFor(() => expect(result.current.svg).toBe("<svg>class</svg>"))

    expect(mockBuildFn).toHaveBeenCalledWith(mockNode, mockRootComponent)
  })

  it("passes idPrefix to mermaid.render element id", async () => {
    const { result } = renderHook(() =>
      useMermaidClassDiagram(mockBuildFn, mockNode, "comp-class"),
    )

    await waitFor(() => expect(result.current.svg).toBe("<svg>class</svg>"))

    expect(mermaid.render).toHaveBeenCalledWith(
      expect.stringMatching(/^mermaid-comp-class-\d+$/),
      expect.any(String),
    )
  })

  it("returns error when mermaid.render throws", async () => {
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error("Syntax error in diagram"))

    const { result } = renderHook(() =>
      useMermaidClassDiagram(mockBuildFn, mockNode, "test"),
    )

    await waitFor(() => expect(result.current.error).toBe("Syntax error in diagram"))
    expect(result.current.svg).toBe("")
  })

  it("returns empty state when node is null", async () => {
    const { result } = renderHook(() =>
      useMermaidClassDiagram(mockBuildFn, null, "test"),
    )

    await new Promise((r) => setTimeout(r, 20))

    expect(mermaid.render).not.toHaveBeenCalled()
    expect(result.current.svg).toBe("")
    expect(result.current.error).toBe("")
  })

  it("returns empty state when buildFn returns no mermaidContent", async () => {
    mockBuildFn.mockReturnValueOnce({ mermaidContent: "", idToUuid: {} })

    const { result } = renderHook(() =>
      useMermaidClassDiagram(mockBuildFn, mockNode, "test"),
    )

    await new Promise((r) => setTimeout(r, 20))

    expect(mermaid.render).not.toHaveBeenCalled()
    expect(result.current.svg).toBe("")
  })

  it("exposes elementRef in the return value", () => {
    const { result } = renderHook(() =>
      useMermaidClassDiagram(mockBuildFn, null, "test"),
    )

    expect(result.current.elementRef).toBeDefined()
    expect(result.current.elementRef.current).toBeNull()
  })

  it("wires __integraNavigate to call selectNode with mapped uuid", async () => {
    mockBuildFn.mockReturnValue({ mermaidContent: "classDiagram\n  class A", idToUuid: { A: "uuid-a" } })

    const { result } = renderHook(() =>
      useMermaidClassDiagram(mockBuildFn, mockNode, "test"),
    )

    await waitFor(() => expect(result.current.svg).toBe("<svg>class</svg>"))

    globalThis.__integraNavigate?.("A")
    expect(mockSelectNode).toHaveBeenCalledWith("uuid-a")
  })
})
