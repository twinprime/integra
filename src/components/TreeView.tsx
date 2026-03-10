import { useState, useEffect, useRef } from "react"
import { Download, Upload, RotateCcw, Undo2, Redo2, ArrowLeft, ArrowRight } from "lucide-react"
import integraLogo from "../assets/integra-logo.svg"
import { useSystemStore } from "../store/useSystemStore"
import type {
  Node,
  ComponentNode,
  UseCaseDiagramNode,
  SequenceDiagramNode,
} from "../store/types"
import { ContextMenu } from "./ContextMenu"
import yaml from "js-yaml"
import { TreeNode } from "./tree/TreeNode"
import { saveToDirectory, loadFromDirectory } from "../utils/systemFiles"
import { findParentNode } from "../nodes/nodeTree"

const DERIVED_KEYS = new Set([
  "ownerComponentUuid",
  "referencedNodeIds",
  "referencedFunctionUuids",
])

export const TreeView = () => {
  const rootComponent = useSystemStore((state) => state.rootComponent)
  const setSystem = useSystemStore((state) => state.setSystem)
  const addNode = useSystemStore((state) => state.addNode)
  const selectNode = useSystemStore((state) => state.selectNode)
  const savedSnapshot = useSystemStore((state) => state.savedSnapshot)
  const markSaved = useSystemStore((state) => state.markSaved)
  const clearSystem = useSystemStore((state) => state.clearSystem)
  const undo = useSystemStore((state) => state.undo)
  const redo = useSystemStore((state) => state.redo)
  const canUndo = useSystemStore((state) => state.past.length > 0)
  const canRedo = useSystemStore((state) => state.future.length > 0)
  const goBack = useSystemStore((state) => state.goBack)
  const goForward = useSystemStore((state) => state.goForward)
  const canNavBack = useSystemStore((state) => state.canNavBack)
  const canNavForward = useSystemStore((state) => state.canNavForward)
  const selectedNodeId = useSystemStore((state) => state.selectedNodeId)

  const treeRef = useRef<HTMLDivElement>(null)
  const treeActive = useRef(false)

  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(
    null,
  )

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    node: Node
  } | null>(null)

  const serializeYaml = (comp: ComponentNode) =>
    yaml.dump(
      JSON.parse(
        JSON.stringify(comp, (key, value) =>
          DERIVED_KEYS.has(key) ? undefined : value,
        ),
      ),
      { indent: 2, noRefs: true, skipInvalid: true },
    )

  const hasUnsavedChanges =
    savedSnapshot !== null && serializeYaml(rootComponent) !== savedSnapshot

  // Mark initial (persisted) state as clean on first mount
  useEffect(() => {
    markSaved(serializeYaml(rootComponent))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Track whether the tree panel is "active" (last interacted with).
  // Uses pointerdown so clicking toolbar buttons keeps the tree active.
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      treeActive.current = !!(
        treeRef.current &&
        e.target instanceof globalThis.Node &&
        treeRef.current.contains(e.target)
      )
    }
    document.addEventListener("pointerdown", onPointer)
    return () => document.removeEventListener("pointerdown", onPointer)
  }, [])

  // Navigating to a node via a diagram link also activates the tree.
  useEffect(() => {
    if (selectedNodeId) treeActive.current = true
  }, [selectedNodeId])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement
      )
        return
      const mod = e.metaKey || e.ctrlKey
      if (mod && !e.shiftKey && e.key === "z") {
        e.preventDefault()
        undo()
      }
      if (mod && e.shiftKey && e.key === "z") {
        e.preventDefault()
        redo()
      }
      if (e.altKey && e.key === "ArrowLeft" && treeActive.current) {
        e.preventDefault()
        goBack()
      }
      if (e.altKey && e.key === "ArrowRight" && treeActive.current) {
        e.preventDefault()
        goForward()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [undo, redo])

  const handleSave = async () => {
    try {
      if (!("showDirectoryPicker" in window)) {
        alert(
          "Saving as a directory requires Chrome or Edge. Please use a supported browser.",
        )
        return
      }
      const handle =
        dirHandle ?? (await window.showDirectoryPicker({ mode: "readwrite" }))
      await saveToDirectory(handle, rootComponent)
      setDirHandle(handle)
      markSaved(serializeYaml(rootComponent))
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        console.error("Failed to save system:", error)
        alert("Failed to save system: " + (error as Error).message)
      }
    }
  }

  const handleLoad = async () => {
    if (hasUnsavedChanges) {
      if (
        !confirm(
          "You have unsaved changes. Loading a new directory will discard them. Continue?",
        )
      )
        return
    }

    try {
      if (!("showDirectoryPicker" in window)) {
        alert(
          "Loading from a directory requires Chrome or Edge. Please use a supported browser.",
        )
        return
      }
      const handle = await window.showDirectoryPicker({ mode: "readwrite" })
      const loadedSystem = await loadFromDirectory(handle)
      setSystem(loadedSystem)
      setDirHandle(handle)
      markSaved(serializeYaml(loadedSystem))
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        console.error("Failed to load system:", error)
        alert("Failed to load system: " + (error as Error).message)
      }
    }
  }

  const handleClear = () => {
    if (hasUnsavedChanges) {
      if (
        !confirm(
          "You have unsaved changes. Clearing will discard them. Continue?",
        )
      )
        return
    }
    clearSystem()
  }

  if (!rootComponent)
    return <div className="p-4 text-sm text-gray-500">No system defined</div>

  const handleContextMenu = (e: React.MouseEvent, node: Node) => {
    e.preventDefault()
    // Compute items before showing menu; skip if nothing available
    const items = computeMenuItems(node)
    if (items.length === 0) return
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }

  const handleCloseContextMenu = () => {
    setContextMenu(null)
  }

  const handleAddNode = (type: "use-case-diagram" | "sequence-diagram") => {
    if (!contextMenu) return

    const label =
      type === "use-case-diagram" ? "use case diagram" : "sequence diagram"
    const id = prompt(`Enter ${label} ID (e.g. my-feature)`)?.trim()
    if (!id) return
    if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(id)) {
      alert(
        `Invalid ID "${id}". Must start with a letter or _ and contain only letters, digits, _ or -.`,
      )
      return
    }

    const name = id
      .split(/[_-]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
    const uuid = crypto.randomUUID()

    const findOwnerComponent = (node: Node): string | null => {
      const nodeParent = findParentNode(rootComponent, node.uuid)
      if (!nodeParent) return null
      if (nodeParent.type === "component") return nodeParent.uuid
      return findOwnerComponent(nodeParent)
    }

    let newNode: Node
    if (type === "use-case-diagram") {
      newNode = {
        uuid,
        id,
        name,
        type,
        content: "",
        description: "",
        referencedNodeIds: [],
        ownerComponentUuid: contextMenu.node.uuid,
        useCases: [],
      } satisfies UseCaseDiagramNode
    } else {
      newNode = {
        uuid,
        id,
        name,
        type,
        content: "",
        description: "",
        referencedNodeIds: [],
        referencedFunctionUuids: [],
        ownerComponentUuid: findOwnerComponent(contextMenu.node) ?? "",
      } satisfies SequenceDiagramNode
    }

    addNode(contextMenu.node.uuid, newNode)
    selectNode(uuid)
  }

  type MenuItem = {
    label: string
    onClick: () => void
    icon?: React.ReactNode
    className?: string
  }

  const computeMenuItems = (node: Node): MenuItem[] => {
    const items: MenuItem[] = []

    if (node.type === "component") {
      items.push({
        label: "Add Use Case Diagram",
        onClick: () => handleAddNode("use-case-diagram"),
      })
    } else if (node.type === "use-case") {
      items.push({
        label: "Add Sequence Diagram",
        onClick: () => handleAddNode("sequence-diagram"),
      })
    }

    return items
  }

  const getMenuItems = () => {
    if (!contextMenu) return []
    return computeMenuItems(contextMenu.node)
  }

  return (
    <div ref={treeRef} className="contents">
      <div className="p-4 border-b border-gray-800 font-semibold text-gray-300 bg-gray-800/50 backdrop-blur-sm flex items-center justify-between">
        <span className="flex items-center gap-2" title="Integra">
          <img src={integraLogo} width={18} height={18} alt="Integra" />
          {hasUnsavedChanges && (
            <span
              className="text-xs font-normal text-yellow-500"
              title="Unsaved changes"
            >
              ●
            </span>
          )}
        </span>
        <div className="flex gap-1">
          <button
            onClick={goBack}
            disabled={!canNavBack}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Go back (Alt+←)"
          >
            <ArrowLeft size={16} />
          </button>
          <button
            onClick={goForward}
            disabled={!canNavForward}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Go forward (Alt+→)"
          >
            <ArrowRight size={16} />
          </button>
          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Undo (Cmd+Z)"
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Redo (Cmd+Shift+Z)"
          >
            <Redo2 size={16} />
          </button>
          <button
            onClick={handleSave}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
            title="Save system to YAML file"
          >
            <Download size={16} />
          </button>
          <button
            onClick={handleLoad}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
            title="Load system from YAML file"
          >
            <Upload size={16} />
          </button>
          <button
            onClick={handleClear}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-red-400 transition-colors"
            title="Clear system"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto pb-8">
        <TreeNode node={rootComponent} onContextMenu={handleContextMenu} />
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={handleCloseContextMenu}
            items={getMenuItems()}
          />
        )}
      </div>
    </div>
  )
}
