import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useSequenceDiagram } from "./useSequenceDiagram"
import type { SequenceDiagramNode, ComponentNode } from "../store/types"
import type { SystemState } from "../store/useSystemStore"
import type { RenderResult } from "mermaid"

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: "<svg>seq</svg>", bindFunctions: undefined }),
  },
}))

vi.mock("../store/useSystemStore", () => ({
  useSystemStore: vi.fn(),
}))

vi.mock("../nodes/nodeTree", () => ({
  findNode: vi.fn(),
}))

vi.mock("../parser/sequenceDiagram/mermaidGenerator", () => ({
  generateSequenceMermaid: vi.fn().mockReturnValue({
    mermaidContent: "sequenceDiagram\n  A->>B: hello",
    idToUuid: { A: "uuid-a", B: "uuid-b" },
    messageLabelToUuid: { hello: "fn-uuid" },
    messageLabelToInterfaceUuid: { hello: "iface-uuid" },
  }),
}))

import mermaid from "mermaid"
import { useSystemStore } from "../store/useSystemStore"
import { findNode } from "../nodes/nodeTree"
import { generateSequenceMermaid } from "../parser/sequenceDiagram/mermaidGenerator"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockSelectNode = vi.fn()
const mockSelectInterface = vi.fn()

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

const mockDiagramNode: SequenceDiagramNode = {
  uuid: "seq-uuid",
  id: "seq",
  name: "Sequence Diagram",
  type: "sequence-diagram",
  content: "participant A\nparticipant B\nA->>B: hello",
  referencedNodeIds: [],
  ownerComponentUuid: "root-uuid",
  referencedFunctionUuids: [],
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useSequenceDiagram", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSystemStore).mockImplementation((selector: (s: SystemState) => unknown) =>
      selector({ rootComponent: mockRootComponent, selectNode: mockSelectNode, selectInterface: mockSelectInterface } as unknown as SystemState),
    )
    vi.mocked(findNode).mockReturnValue(mockRootComponent)
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: "<svg>seq</svg>",
      diagramType: "sequence",
      bindFunctions: undefined,
    } satisfies RenderResult)
    vi.mocked(generateSequenceMermaid).mockReturnValue({
      mermaidContent: "sequenceDiagram\n  A->>B: hello",
      idToUuid: { A: "uuid-a", B: "uuid-b" },
      messageLabelToUuid: { hello: "fn-uuid" },
      messageLabelToInterfaceUuid: { hello: "iface-uuid" },
    })
  })

  it("returns expected shape: svg, error, errorDetails, mermaidSource, elementRef, handleSequenceClick", () => {
    const { result } = renderHook(() => useSequenceDiagram(null))

    expect(result.current).toHaveProperty("svg")
    expect(result.current).toHaveProperty("error")
    expect(result.current).toHaveProperty("errorDetails")
    expect(result.current).toHaveProperty("mermaidSource")
    expect(result.current).toHaveProperty("elementRef")
    expect(result.current).toHaveProperty("handleSequenceClick")
    expect(typeof result.current.handleSequenceClick).toBe("function")
  })

  it("returns SVG after successful render", async () => {
    const { result } = renderHook(() => useSequenceDiagram(mockDiagramNode))

    await waitFor(() => expect(result.current.svg).toBe("<svg>seq</svg>"))
    expect(result.current.error).toBe("")
  })

  it("calls generateSequenceMermaid with diagram content and root component", async () => {
    const { result } = renderHook(() => useSequenceDiagram(mockDiagramNode))

    await waitFor(() => expect(result.current.svg).toBe("<svg>seq</svg>"))

    expect(generateSequenceMermaid).toHaveBeenCalledWith(
      mockDiagramNode.content,
      expect.anything(),
      mockRootComponent,
      mockDiagramNode.ownerComponentUuid,
    )
  })

  it("returns error state when mermaid.render throws", async () => {
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error("Sequence parse error"))

    const { result } = renderHook(() => useSequenceDiagram(mockDiagramNode))

    await waitFor(() => expect(result.current.error).toBe("Invalid Diagram Syntax"))
    expect(result.current.svg).toBe("")
  })

  it("returns empty state when diagramNode is null", async () => {
    const { result } = renderHook(() => useSequenceDiagram(null))

    await new Promise((r) => setTimeout(r, 20))

    expect(result.current.svg).toBe("")
    expect(result.current.error).toBe("")
    expect(mermaid.render).not.toHaveBeenCalled()
  })
})
