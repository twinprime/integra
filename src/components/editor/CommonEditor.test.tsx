import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CommonEditor } from "./CommonEditor"
import type { ActorNode } from "../../store/types"
import type { SystemState } from "../../store/useSystemStore"

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../store/useSystemStore", () => ({
  useSystemStore: vi.fn(),
}))

vi.mock("./MarkdownEditor", () => ({
  MarkdownEditor: ({
    value,
    onChange,
    onBlur,
    placeholder,
  }: {
    value: string
    onChange: (v: string) => void
    onBlur?: () => void
    placeholder?: string
  }) => (
    <textarea
      data-testid="markdown-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
    />
  ),
}))

vi.mock("./NodeReferencesButton", () => ({
  NodeReferencesButton: () => null,
}))

vi.mock("../../nodes/nodeTree", () => ({
  getNodeSiblingIds: vi.fn(() => []),
}))

vi.mock("../../utils/nodeUtils", () => ({
  findReferencingDiagrams: vi.fn(() => []),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

import { useSystemStore } from "../../store/useSystemStore"

const mockRenameNodeId = vi.fn()

const mockRootComponent = {
  uuid: "root-uuid",
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
    renameNodeId: mockRenameNodeId,
  }
  vi.mocked(useSystemStore).mockImplementation(
    (selector: (s: SystemState) => unknown) => selector(state as unknown as SystemState),
  )
}

function makeActorNode(overrides: Partial<ActorNode> = {}): ActorNode {
  return {
    uuid: "actor-uuid-1",
    id: "myActor",
    name: "My Actor",
    type: "actor",
    description: "Actor description",
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  setupStoreMock()
})

describe("CommonEditor", () => {
  describe("rendering", () => {
    it("renders the node name as heading", () => {
      const node = makeActorNode()
      render(<CommonEditor node={node} onUpdate={vi.fn()} />)
      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("My Actor")
    })

    it("renders the node type badge", () => {
      const node = makeActorNode()
      render(<CommonEditor node={node} onUpdate={vi.fn()} />)
      expect(screen.getByText("actor")).toBeInTheDocument()
    })

    it("renders the name input pre-filled with node.name", () => {
      const node = makeActorNode({ name: "Test Actor" })
      render(<CommonEditor node={node} onUpdate={vi.fn()} />)
      expect(screen.getByDisplayValue("Test Actor")).toBeInTheDocument()
    })

    it("renders the ID input pre-filled with node.id", () => {
      const node = makeActorNode({ id: "test_actor" })
      render(<CommonEditor node={node} onUpdate={vi.fn()} />)
      expect(screen.getByDisplayValue("test_actor")).toBeInTheDocument()
    })

    it("renders the description in the markdown editor", () => {
      const node = makeActorNode({ description: "Some desc" })
      render(<CommonEditor node={node} onUpdate={vi.fn()} />)
      expect(screen.getByDisplayValue("Some desc")).toBeInTheDocument()
    })
  })

  describe("name editing", () => {
    it("calls onUpdate with new name on blur", async () => {
      const user = userEvent.setup()
      const onUpdate = vi.fn()
      const node = makeActorNode({ name: "Old Name" })
      render(<CommonEditor node={node} onUpdate={onUpdate} />)

      const nameInput = screen.getByDisplayValue("Old Name")
      await user.clear(nameInput)
      await user.type(nameInput, "New Name")
      await user.tab()

      expect(onUpdate).toHaveBeenCalledWith({ name: "New Name" })
    })

    it("trims the name before saving", async () => {
      const user = userEvent.setup()
      const onUpdate = vi.fn()
      const node = makeActorNode({ name: "Old" })
      render(<CommonEditor node={node} onUpdate={onUpdate} />)

      const nameInput = screen.getByDisplayValue("Old")
      await user.clear(nameInput)
      await user.type(nameInput, "  Trimmed  ")
      await user.tab()

      expect(onUpdate).toHaveBeenCalledWith({ name: "Trimmed" })
    })

    it("does not call onUpdate when name is unchanged", async () => {
      const user = userEvent.setup()
      const onUpdate = vi.fn()
      const node = makeActorNode({ name: "Same Name" })
      render(<CommonEditor node={node} onUpdate={onUpdate} />)

      const nameInput = screen.getByDisplayValue("Same Name")
      await user.click(nameInput)
      await user.tab()

      expect(onUpdate).not.toHaveBeenCalled()
    })

    it("reverts to original name when empty name is blurred", async () => {
      const user = userEvent.setup()
      const onUpdate = vi.fn()
      const node = makeActorNode({ name: "My Actor" })
      render(<CommonEditor node={node} onUpdate={onUpdate} />)

      const nameInput = screen.getByDisplayValue("My Actor")
      await user.clear(nameInput)
      await user.tab()

      expect(onUpdate).not.toHaveBeenCalled()
      expect(screen.getByDisplayValue("My Actor")).toBeInTheDocument()
    })
  })

  describe("description editing", () => {
    it("calls onUpdate with new description on blur", async () => {
      const user = userEvent.setup()
      const onUpdate = vi.fn()
      const node = makeActorNode({ description: "" })
      render(<CommonEditor node={node} onUpdate={onUpdate} />)

      const editor = screen.getByTestId("markdown-editor")
      await user.click(editor)
      await user.type(editor, "New description")
      await user.tab()

      expect(onUpdate).toHaveBeenCalledWith({ description: "New description" })
    })

    it("does not call onUpdate when description is unchanged", async () => {
      const user = userEvent.setup()
      const onUpdate = vi.fn()
      const node = makeActorNode({ description: "Existing desc" })
      render(<CommonEditor node={node} onUpdate={onUpdate} />)

      const editor = screen.getByTestId("markdown-editor")
      await user.click(editor)
      await user.tab()

      expect(onUpdate).not.toHaveBeenCalled()
    })
  })

  describe("ID editing", () => {
    it("shows an error while typing an empty ID", async () => {
      const user = userEvent.setup()
      const node = makeActorNode({ id: "myActor" })
      render(<CommonEditor node={node} onUpdate={vi.fn()} />)

      const idInput = screen.getByLabelText("Node ID")
      await user.clear(idInput)
      // Error is shown during typing (onChange); blur clears it by reverting to original
      expect(screen.getByText("ID cannot be empty")).toBeInTheDocument()
    })

    it("shows an error while typing an invalid ID format", async () => {
      const user = userEvent.setup()
      const node = makeActorNode({ id: "myActor" })
      render(<CommonEditor node={node} onUpdate={vi.fn()} />)

      const idInput = screen.getByLabelText("Node ID")
      await user.clear(idInput)
      await user.type(idInput, "123bad")
      // Error is shown during typing (onChange); blur reverts and clears it
      expect(
        screen.getByText("ID must start with a letter or _ and contain only letters, digits, or _"),
      ).toBeInTheDocument()
    })

    it("calls renameNodeId with new valid ID on blur", async () => {
      const user = userEvent.setup()
      const node = makeActorNode({ id: "oldId" })
      render(<CommonEditor node={node} onUpdate={vi.fn()} />)

      const idInput = screen.getByLabelText("Node ID")
      await user.clear(idInput)
      await user.type(idInput, "newId")
      await user.tab()

      expect(mockRenameNodeId).toHaveBeenCalledWith("actor-uuid-1", "newId")
    })

    it("pressing Enter on ID field triggers rename", async () => {
      const user = userEvent.setup()
      const node = makeActorNode({ id: "oldId" })
      render(<CommonEditor node={node} onUpdate={vi.fn()} />)

      const idInput = screen.getByLabelText("Node ID")
      await user.clear(idInput)
      await user.type(idInput, "validId")
      await user.keyboard("{Enter}")

      expect(mockRenameNodeId).toHaveBeenCalledWith("actor-uuid-1", "validId")
    })
  })
})
