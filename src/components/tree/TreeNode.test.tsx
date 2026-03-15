import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import type { ComponentNode } from "../../store/types"
import { TreeNode } from "./TreeNode"
import type { SystemState } from "../../store/useSystemStore"

vi.mock("../../store/useSystemStore", () => ({
  useSystemStore: vi.fn(),
}))

vi.mock("../../utils/nodeUtils", () => ({
  isNodeOrphaned: vi.fn(() => false),
}))

vi.mock("../../nodes/nodeTree", () => ({
  getNodeHandler: vi.fn(() => ({ orphanWhenUnreferenced: false })),
}))

vi.mock("./NodeIcon", () => ({
  NodeIcon: () => <span data-testid="node-icon" />,
}))

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCenter: {},
  PointerSensor: class {},
  useSensor: () => ({}),
  useSensors: () => ([]),
}))

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: { "data-sortable-row": "true" },
    listeners: {},
    setNodeRef: () => {},
    transform: { x: 10, y: 0, scaleX: 1, scaleY: 1 },
    transition: "transform 200ms ease",
    isDragging: false,
  }),
}))

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: () => "translate3d(10px, 0px, 0)",
    },
  },
}))

import { useSystemStore } from "../../store/useSystemStore"

const mockState = {
  selectedNodeId: null,
  selectNode: vi.fn(),
  deleteNode: vi.fn(),
  reorderNode: vi.fn(),
}

function makeComponentNode(): ComponentNode {
  return {
    uuid: "root-uuid",
    id: "root",
    name: "Root Component",
    type: "component",
    description: "",
    subComponents: [
      {
        uuid: "child-uuid",
        id: "child",
        name: "Child Component",
        type: "component",
        description: "",
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
      },
    ],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useSystemStore).mockImplementation(
    (selector: (state: SystemState) => unknown) =>
      selector({
        ...mockState,
        rootComponent: makeComponentNode(),
      } as unknown as SystemState),
  )
})

describe("TreeNode", () => {
  it("keeps expanded child content outside the transformed draggable row", () => {
    render(<TreeNode node={makeComponentNode()} onContextMenu={vi.fn()} />)

    const transformedRow = document.querySelector('[style*="translate3d"]')
    expect(transformedRow).not.toBeNull()
    expect(within(transformedRow as HTMLElement).getByText("Root Component")).toBeInTheDocument()
    expect(
      within(transformedRow as HTMLElement).queryByText("Child Component"),
    ).not.toBeInTheDocument()

    expect(screen.getByText("Child Component")).toBeInTheDocument()
  })
})
