import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ComponentEditor } from "./ComponentEditor"
import type { ComponentNode, InterfaceSpecification } from "../../store/types"

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

// Stub InterfaceEditor to avoid deep rendering complexity
vi.mock("./InterfaceEditor", () => ({
  InterfaceEditor: ({
    iface,
  }: {
    iface: { uuid: string; name: string }
  }) => <div data-testid={`interface-editor-${iface.uuid}`}>{iface.name}</div>,
}))

vi.mock("../../nodes/nodeTree", () => ({
  getNodeSiblingIds: vi.fn(() => []),
  findParentNode: vi.fn(() => null),
}))

vi.mock("../../utils/nodeUtils", () => ({
  findReferencingDiagrams: vi.fn(() => []),
  collectReferencedFunctionUuids: vi.fn(() => new Set<string>()),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

import { useSystemStore } from "../../store/useSystemStore"
import { findParentNode } from "../../nodes/nodeTree"

const mockRenameNodeId = vi.fn()
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

function setupStoreMock(selectedInterfaceUuid: string | null = null) {
  const state = {
    rootComponent: mockRootComponent,
    renameNodeId: mockRenameNodeId,
    selectedInterfaceUuid,
    selectInterface: mockSelectInterface,
  }
  vi.mocked(useSystemStore).mockImplementation(
    (selector: (s: typeof state) => unknown) => selector(state),
  )
}

function makeInterface(
  id: string,
  name: string,
  overrides: Partial<InterfaceSpecification> = {},
): InterfaceSpecification {
  return {
    uuid: `iface-uuid-${id}`,
    id,
    name,
    type: "rest",
    functions: [],
    ...overrides,
  }
}

function makeComponentNode(overrides: Partial<ComponentNode> = {}): ComponentNode {
  return {
    uuid: "comp-uuid-1",
    id: "myComp",
    name: "My Component",
    type: "component",
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
    description: "",
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  setupStoreMock()
  vi.mocked(findParentNode).mockReturnValue(null)
})

describe("ComponentEditor", () => {
  describe("rendering", () => {
    it("renders the component name as heading", () => {
      const node = makeComponentNode({ name: "My Component" })
      render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("My Component")
    })

    it("renders the node type badge", () => {
      const node = makeComponentNode()
      render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
      expect(screen.getByText("component")).toBeInTheDocument()
    })

    it("renders the name input pre-filled", () => {
      const node = makeComponentNode({ name: "Service A" })
      render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
      expect(screen.getByDisplayValue("Service A")).toBeInTheDocument()
    })

    it("renders the ID input pre-filled", () => {
      const node = makeComponentNode({ id: "serviceA" })
      render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
      expect(screen.getByDisplayValue("serviceA")).toBeInTheDocument()
    })
  })

  describe("interface tabs", () => {
    it("renders a tab for each interface", () => {
      const node = makeComponentNode({
        interfaces: [
          makeInterface("api", "API"),
          makeInterface("events", "Events"),
        ],
      })
      render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
      expect(screen.getByTestId("interface-tab-api")).toBeInTheDocument()
      expect(screen.getByTestId("interface-tab-events")).toBeInTheDocument()
    })

    it("renders the first interface panel by default", () => {
      const node = makeComponentNode({
        interfaces: [
          makeInterface("api", "API"),
          makeInterface("events", "Events"),
        ],
      })
      render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
      // The first tab panel should be visible
      expect(screen.getByTestId("interface-editor-iface-uuid-api")).toBeInTheDocument()
    })

    it("clicking a tab switches to that interface panel", async () => {
      const user = userEvent.setup()
      const node = makeComponentNode({
        interfaces: [
          makeInterface("api", "API"),
          makeInterface("events", "Events"),
        ],
      })
      render(<ComponentEditor node={node} onUpdate={vi.fn()} />)

      await user.click(screen.getByTestId("interface-tab-events"))

      expect(screen.getByTestId("interface-editor-iface-uuid-events")).toBeInTheDocument()
      expect(screen.queryByTestId("interface-editor-iface-uuid-api")).not.toBeInTheDocument()
    })

    it("shows interface count badge", () => {
      const node = makeComponentNode({
        interfaces: [makeInterface("a", "A"), makeInterface("b", "B")],
      })
      render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
      expect(screen.getByText("2")).toBeInTheDocument()
    })

    it("renders nothing when interfaces list is empty", () => {
      const node = makeComponentNode({ interfaces: [] })
      render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
      expect(screen.queryByText("Interface Specifications")).not.toBeInTheDocument()
    })
  })

  describe("name editing", () => {
    it("calls onUpdate with new name on blur", async () => {
      const user = userEvent.setup()
      const onUpdate = vi.fn()
      const node = makeComponentNode({ name: "Old Name" })
      render(<ComponentEditor node={node} onUpdate={onUpdate} />)

      const nameInput = screen.getByDisplayValue("Old Name")
      await user.clear(nameInput)
      await user.type(nameInput, "New Name")
      await user.tab()

      expect(onUpdate).toHaveBeenCalledWith({ name: "New Name" })
    })

    it("reverts to original name when empty name is blurred", async () => {
      const user = userEvent.setup()
      const onUpdate = vi.fn()
      const node = makeComponentNode({ name: "My Component" })
      render(<ComponentEditor node={node} onUpdate={onUpdate} />)

      const nameInput = screen.getByDisplayValue("My Component")
      await user.clear(nameInput)
      await user.tab()

      expect(onUpdate).not.toHaveBeenCalled()
      expect(screen.getByDisplayValue("My Component")).toBeInTheDocument()
    })
  })

  describe("inherit parent interface selector", () => {
    it("does not render the inherit selector for a root component (no parent)", () => {
      vi.mocked(findParentNode).mockReturnValue(null)
      const node = makeComponentNode()
      render(<ComponentEditor node={node} onUpdate={vi.fn()} />)
      expect(screen.queryByTestId("inherit-parent-select")).not.toBeInTheDocument()
    })

    it("renders the inherit selector when parent has uninherited interfaces", () => {
      const parentIface = makeInterface("parentApi", "Parent API")
      const parentNode = makeComponentNode({
        uuid: "parent-uuid",
        id: "parent",
        name: "Parent",
        interfaces: [parentIface],
      })
      vi.mocked(findParentNode).mockReturnValue(parentNode)

      // child has no interfaces, so parentApi is uninherited
      const childNode = makeComponentNode({ interfaces: [] })
      render(<ComponentEditor node={childNode} onUpdate={vi.fn()} />)

      expect(screen.getByTestId("inherit-parent-select")).toBeInTheDocument()
      expect(screen.getByText("Parent API")).toBeInTheDocument()
    })

    it("does not render the inherit selector when all parent interfaces are already inherited", () => {
      const parentIface = makeInterface("parentApi", "Parent API")
      const parentNode = makeComponentNode({
        uuid: "parent-uuid",
        id: "parent",
        name: "Parent",
        interfaces: [parentIface],
      })
      vi.mocked(findParentNode).mockReturnValue(parentNode)

      // child already inherits parentApi
      const childNode = makeComponentNode({
        interfaces: [
          makeInterface("parentApi", "Parent API", {
            parentInterfaceUuid: parentIface.uuid,
          }),
        ],
      })
      render(<ComponentEditor node={childNode} onUpdate={vi.fn()} />)

      expect(screen.queryByTestId("inherit-parent-select")).not.toBeInTheDocument()
    })

    it("calls onUpdate with new inherited interface when selector changes", async () => {
      const user = userEvent.setup()
      const onUpdate = vi.fn()
      const parentIface = makeInterface("parentApi", "Parent API")
      const parentNode = makeComponentNode({
        uuid: "parent-uuid",
        id: "parent",
        name: "Parent",
        interfaces: [parentIface],
      })
      vi.mocked(findParentNode).mockReturnValue(parentNode)

      const childNode = makeComponentNode({ interfaces: [] })
      render(<ComponentEditor node={childNode} onUpdate={onUpdate} />)

      await user.selectOptions(
        screen.getByTestId("inherit-parent-select"),
        parentIface.uuid,
      )

      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          interfaces: expect.arrayContaining([
            expect.objectContaining({
              parentInterfaceUuid: parentIface.uuid,
              id: "parentApi",
            }),
          ]),
        }),
      )
    })
  })

  describe("ID editing", () => {
    it("shows error for invalid ID format while typing", async () => {
      const user = userEvent.setup()
      const node = makeComponentNode({ id: "validId" })
      render(<ComponentEditor node={node} onUpdate={vi.fn()} />)

      const idInput = screen.getByLabelText("Node ID")
      await user.clear(idInput)
      await user.type(idInput, "1invalid")
      // Error shown during typing; blur will revert and clear it
      expect(
        screen.getByText("ID must start with a letter or _ and contain only letters, digits, or _"),
      ).toBeInTheDocument()
    })

    it("calls renameNodeId on valid ID blur", async () => {
      const user = userEvent.setup()
      const node = makeComponentNode({ id: "oldId" })
      render(<ComponentEditor node={node} onUpdate={vi.fn()} />)

      const idInput = screen.getByLabelText("Node ID")
      await user.clear(idInput)
      await user.type(idInput, "newId")
      await user.tab()

      expect(mockRenameNodeId).toHaveBeenCalledWith("comp-uuid-1", "newId")
    })
  })
})
