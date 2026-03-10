// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TreeNode } from "./TreeNode"
import { useSystemStore } from "../../store/useSystemStore"
import type { ComponentNode, UseCaseDiagramNode, UseCaseNode, SequenceDiagramNode } from "../../store/types"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeSeqDiag = (referencedNodeIds: string[]): SequenceDiagramNode => ({
  uuid: "seq-uuid",
  id: "seq",
  name: "Seq",
  type: "sequence-diagram",
  content: "",
  description: "",
  ownerComponentUuid: "root-uuid",
  referencedNodeIds,
  referencedFunctionUuids: [],
})

const makeUseCase = (uuid = "uc-uuid", seqDiags: SequenceDiagramNode[] = []): UseCaseNode => ({
  uuid,
  id: "login",
  name: "Login",
  type: "use-case",
  description: "",
  sequenceDiagrams: seqDiags,
})

const makeUseCaseDiagram = (useCases: UseCaseNode[]): UseCaseDiagramNode => ({
  uuid: "ucd-uuid",
  id: "ucd",
  name: "My UCD",
  type: "use-case-diagram",
  content: "",
  description: "",
  ownerComponentUuid: "root-uuid",
  referencedNodeIds: [],
  useCases,
})

const makeRoot = (ucd: UseCaseDiagramNode): ComponentNode => ({
  uuid: "root-uuid",
  id: "root",
  name: "Root",
  type: "component",
  description: "",
  subComponents: [],
  actors: [],
  interfaces: [],
  useCaseDiagrams: [ucd],
})

function resetStore(root: ComponentNode) {
  useSystemStore.setState({ rootComponent: root, selectedNodeId: null, savedSnapshot: null })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("TreeNode – use-case-diagram trash icon (delete button)", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { randomUUID: () => "test-uuid" })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("shows trash icon on hover for an empty use-case-diagram (no use cases)", async () => {
    const ucd = makeUseCaseDiagram([])
    const root = makeRoot(ucd)
    resetStore(root)

    const user = userEvent.setup()
    render(<TreeNode node={ucd} onContextMenu={vi.fn()} parent={root} />)

    expect(screen.queryByTitle('Delete "My UCD"')).not.toBeInTheDocument()

    await user.hover(screen.getByRole("treeitem"))

    expect(screen.getByTitle('Delete "My UCD"')).toBeInTheDocument()
  })

  it("shows trash icon on hover when use cases exist but none are referenced", async () => {
    const uc = makeUseCase("uc-uuid", [])
    const ucd = makeUseCaseDiagram([uc])
    const root = makeRoot(ucd)
    resetStore(root)

    const user = userEvent.setup()
    render(<TreeNode node={ucd} onContextMenu={vi.fn()} parent={root} />)

    // First treeitem is the ucd row itself; child use cases render below it
    const ucDiagRow = screen.getAllByRole("treeitem")[0]
    await user.hover(ucDiagRow)

    expect(screen.getByTitle('Delete "My UCD"')).toBeInTheDocument()
  })

  it("hides trash icon when any use case is referenced by a sequence diagram", async () => {
    // seq diagram in a different use-case references uc-uuid
    const referencingSeq = makeSeqDiag(["uc-uuid"])
    const otherUc = makeUseCase("other-uc-uuid", [referencingSeq])
    const uc = makeUseCase("uc-uuid", [])
    const ucd = makeUseCaseDiagram([uc, otherUc])
    const root = makeRoot(ucd)
    resetStore(root)

    const user = userEvent.setup()
    // Render only the ucd row (not its children) to isolate hover on ucd itself
    render(<TreeNode node={ucd} onContextMenu={vi.fn()} parent={root} />)

    // Find the ucd treeitem (first role="treeitem" is the ucd row)
    const ucDiagRow = screen.getAllByRole("treeitem")[0]
    await user.hover(ucDiagRow)

    expect(screen.queryByTitle('Delete "My UCD"')).not.toBeInTheDocument()
  })
})
