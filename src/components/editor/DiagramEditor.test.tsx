import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DiagramEditor } from "./DiagramEditor"
import type { SequenceDiagramNode } from "../../store/types"
import type { FunctionMatch } from "../../parser/sequenceDiagram/systemUpdater"
import type { SystemState } from "../../store/useSystemStore"

vi.mock("../../store/useSystemStore", () => ({
  useSystemStore: vi.fn(),
  getSequenceDiagrams: vi.fn(() => []),
}))

vi.mock("../../parser/sequenceDiagram/systemUpdater", async () => {
  const actual = await vi.importActual<typeof import("../../parser/sequenceDiagram/systemUpdater")>(
    "../../parser/sequenceDiagram/systemUpdater",
  )
  return {
    ...actual,
    analyzeSequenceDiagramChanges: vi.fn<() => FunctionMatch[]>(() => []),
  }
})

vi.mock("./MarkdownEditor", () => ({
  MarkdownEditor: ({
    value,
    onChange,
    onBlur,
  }: {
    value: string
    onChange: (value: string) => void
    onBlur?: () => void
  }) => (
    <textarea
      data-testid="markdown-editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  ),
}))

vi.mock("./NodeReferencesButton", () => ({
  NodeReferencesButton: () => null,
}))

vi.mock("../FunctionUpdateDialog", () => ({
  FunctionUpdateDialog: () => null,
}))

vi.mock("../../utils/nodeUtils", () => ({
  findReferencingDiagrams: vi.fn(() => []),
}))

vi.mock("../../nodes/nodeTree", async () => {
  const actual = await vi.importActual<typeof import("../../nodes/nodeTree")>(
    "../../nodes/nodeTree",
  )
  return {
    ...actual,
    getNodeSiblingIds: vi.fn(() => []),
  }
})

import { useSystemStore } from "../../store/useSystemStore"

const mockApplyFunctionUpdates = vi.fn()
const mockClearParseError = vi.fn()
const mockRenameNodeId = vi.fn()
const mockSelectInterface = vi.fn()
const mockSelectNode = vi.fn()

const mockRootComponent = {
  uuid: "root-component-uuid",
  id: "root",
  name: "Root",
  type: "component" as const,
  subComponents: [],
  actors: [],
  useCaseDiagrams: [],
  interfaces: [],
}

function setupStoreMock() {
  const state = {
    rootComponent: mockRootComponent,
    applyFunctionUpdates: mockApplyFunctionUpdates,
    parseError: null,
    clearParseError: mockClearParseError,
    selectNode: mockSelectNode,
    selectInterface: mockSelectInterface,
    renameNodeId: mockRenameNodeId,
  }

  vi.mocked(useSystemStore).mockImplementation(
    (
      selector?: (store: SystemState) => unknown,
    ) => (selector ? selector(state as unknown as SystemState) : state),
  )
}

function makeSequenceDiagramNode(
  overrides: Partial<SequenceDiagramNode> = {},
): SequenceDiagramNode {
  return {
    uuid: "sequence-diagram-uuid",
    id: "LoginFlow",
    name: "Login Flow",
    type: "sequence-diagram",
    description: "",
    ownerComponentUuid: "root-component-uuid",
    referencedNodeIds: [],
    referencedFunctionUuids: [],
    content: "actor User\ncomponent AuthService\nUser ->> AuthService: IAuth:login()",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setupStoreMock()
})

describe("DiagramEditor", () => {
  it("clicking the preview switches the specification into edit mode", async () => {
    const user = userEvent.setup()
    render(<DiagramEditor node={makeSequenceDiagramNode()} onUpdate={vi.fn()} />)

    const preview = await screen.findByRole("button", {
      name: /diagram specification/i,
    })

    await user.click(preview)

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /diagram specification/i }),
      ).not.toBeInTheDocument()
    })

    const editableContent = document.querySelector('.cm-content[contenteditable="true"]')
    expect(editableContent).not.toBeNull()
  })
})
