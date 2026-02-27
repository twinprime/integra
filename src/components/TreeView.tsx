import { useState, useEffect } from "react"
import {
  ChevronRight,
  ChevronDown,
  Folder,
  Box,
  User,
  FileText,
  Activity,
  Share2,
  Download,
  Upload,
  Trash2,
  RotateCcw,
} from "lucide-react"
import { useSystemStore } from "../store/useSystemStore"
import type { Node, ComponentNode, UseCaseDiagramNode, UseCaseNode, SequenceDiagramNode } from "../store/types"
import { ContextMenu } from "./ContextMenu"
import yaml from "js-yaml"
import { isNodeOrphaned, isUseCaseReferenced, findParentNode } from "../utils/nodeUtils"

interface TreeNodeProps {
  node: Node
  onContextMenu: (e: React.MouseEvent, node: Node) => void
  parent?: ComponentNode
}

const NodeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "component":
      return <Box size={16} className="text-blue-500" />
    case "actor":
      return <User size={16} className="text-green-500" />
    case "use-case":
      return <FileText size={16} className="text-orange-500" />
    case "use-case-diagram":
      return <Share2 size={16} className="text-purple-400" />
    case "sequence-diagram":
      return <Activity size={16} className="text-indigo-500" />
    default:
      return <Folder size={16} className="text-gray-400" />
  }
}

const TreeNode = ({ node, onContextMenu, parent }: TreeNodeProps) => {
  const [expanded, setExpanded] = useState(true)
  const [hovered, setHovered] = useState(false)
  const selectedNodeId = useSystemStore((state) => state.selectedNodeId)
  const selectNode = useSystemStore((state) => state.selectNode)
  const deleteNode = useSystemStore((state) => state.deleteNode)
  const rootComponent = useSystemStore((state) => state.rootComponent)

  const isSelected = selectedNodeId === node.uuid
  const isOrphaned = parent ? isNodeOrphaned(node, parent) : false

  // Determine whether a delete button should be shown
  const isDeletable = (() => {
    if (node.uuid === rootComponent.uuid) return false
    if (node.type === "actor" || node.type === "component") {
      const nodeParent = parent ?? findParentNode(rootComponent, node.uuid) as ComponentNode | null
      return nodeParent?.type === "component" && isNodeOrphaned(node, nodeParent)
    }
    if (node.type === "use-case") {
      return !isUseCaseReferenced(rootComponent, node.uuid)
    }
    // use-case-diagrams, sequence-diagrams are always deletable
    return true
  })()

  let children: Node[] = []
  if (node.type === "component") {
    children = [
      ...node.subComponents,
      ...node.actors,
      ...node.useCaseDiagrams,
    ]
  } else if (node.type === "use-case-diagram") {
    children = node.useCases
  } else if (node.type === "use-case") {
    children = node.sequenceDiagrams
  }

  const hasChildren = children.length > 0

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded(!expanded)
  }

  const handleClick = () => {
    selectNode(node.uuid)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    onContextMenu(e, node)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`Are you sure you want to delete "${node.name}"?`)) {
      deleteNode(node.uuid)
    }
  }

  return (
    <div className="pl-4">
      <div
        role="treeitem"
        aria-selected={isSelected}
        tabIndex={0}
        className={`flex items-center py-1 px-2 cursor-pointer rounded select-none text-[0.9rem] text-gray-300 hover:bg-gray-800 ${
          isSelected ? "bg-sky-900/50 text-sky-300" : ""
        }`}
        onClick={handleClick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick() }}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button
          tabIndex={-1}
          aria-label={expanded ? "Collapse" : "Expand"}
          className="w-4 h-4 flex items-center justify-center mr-1 text-gray-500 hover:text-gray-400 bg-transparent border-0 p-0 cursor-pointer"
          onClick={hasChildren ? handleToggle : undefined}
        >
          {hasChildren &&
            (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
        </button>
        <div className="mr-2 w-4 h-4">
          <NodeIcon type={node.type} />
        </div>
        <div
          className={`flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${
            isOrphaned ? "line-through text-gray-500" : ""
          }`}
        >
          {node.name}
        </div>
        {isDeletable && hovered && (
          <button
            className="ml-1 p-0.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
            title={`Delete "${node.name}"`}
            onClick={handleDelete}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {hasChildren && expanded && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.uuid}
              node={child}
              onContextMenu={onContextMenu}
              parent={node as ComponentNode}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const YAML_FILE_TYPES = [{ description: "YAML files", accept: { "text/yaml": [".yaml", ".yml"] } }]

export const TreeView = () => {
  const rootComponent = useSystemStore((state) => state.rootComponent)
  const setSystem = useSystemStore((state) => state.setSystem)
  const addNode = useSystemStore((state) => state.addNode)
  const selectNode = useSystemStore((state) => state.selectNode)
  const deleteNode = useSystemStore((state) => state.deleteNode)
  const savedSnapshot = useSystemStore((state) => state.savedSnapshot)
  const markSaved = useSystemStore((state) => state.markSaved)
  const clearSystem = useSystemStore((state) => state.clearSystem)

  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null)

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    node: Node
  } | null>(null)

  const serializeYaml = (comp: ComponentNode) =>
    yaml.dump(comp, { indent: 2, noRefs: true, skipInvalid: true })

  const hasUnsavedChanges =
    savedSnapshot !== null && serializeYaml(rootComponent) !== savedSnapshot

  // Mark initial (persisted) state as clean on first mount
  useEffect(() => {
    markSaved(serializeYaml(rootComponent))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    try {
      const yamlContent = serializeYaml(rootComponent)
      const suggestedName = `${rootComponent.name.toLowerCase().replaceAll(/\s+/g, "-")}.yaml`

      if ("showSaveFilePicker" in window) {
        const handle = fileHandle ?? await window.showSaveFilePicker({ types: YAML_FILE_TYPES, suggestedName })
        const writable = await handle.createWritable()
        await writable.write(yamlContent)
        await writable.close()
        setFileHandle(handle)
      } else {
        // Fallback for browsers without File System Access API
        const blob = new Blob([yamlContent], { type: "text/yaml" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = suggestedName
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }
      markSaved(yamlContent)
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        console.error("Failed to save system:", error)
        alert("Failed to save system: " + (error as Error).message)
      }
    }
  }

  const handleLoad = async () => {
    if (hasUnsavedChanges) {
      if (!confirm("You have unsaved changes. Loading a new file will discard them. Continue?")) return
    }

    try {
      let text: string

      if ("showOpenFilePicker" in window) {
        const [handle] = await window.showOpenFilePicker({ types: YAML_FILE_TYPES, multiple: false })
        const file = await handle.getFile()
        text = await file.text()
        setFileHandle(handle)
      } else {
        // Fallback for browsers without File System Access API
        text = await new Promise<string>((resolve, reject) => {
          const input = document.createElement("input")
          input.type = "file"
          input.accept = ".yaml,.yml"
          input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0]
            if (!file) { reject(new Error("No file selected")); return }
            resolve(await file.text())
          }
          input.click()
        })
      }

      const loadedSystem = yaml.load(text) as ComponentNode
      if (!loadedSystem || typeof loadedSystem !== "object" || loadedSystem.type !== "component") {
        throw new Error("Invalid system file format")
      }
      setSystem(loadedSystem)
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
      if (!confirm("You have unsaved changes. Clearing will discard them. Continue?")) return
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

  const handleAddNode = (type: "use-case-diagram" | "use-case" | "sequence-diagram") => {
    if (!contextMenu) return

    let name: string | null
    if (type === "use-case-diagram") {
      name = prompt("Enter use case diagram name", "New Use Case Diagram")
    } else if (type === "use-case") {
      name = prompt("Enter use case name", "New Use Case")
    } else {
      name = prompt("Enter sequence diagram name", "New Sequence Diagram")
    }
    
    if (!name) return

    const id = name.toLowerCase().replaceAll(/\s+/g, "-") + "-" + Date.now()
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
        uuid, id, name, type,
        content: "", description: "", referencedNodeIds: [],
        ownerComponentUuid: contextMenu.node.uuid,
        useCases: [],
      } satisfies UseCaseDiagramNode
    } else if (type === "use-case") {
      newNode = {
        uuid, id, name, type,
        description: "",
        sequenceDiagrams: [],
      } satisfies UseCaseNode
    } else {
      newNode = {
        uuid, id, name, type,
        content: "", description: "", referencedNodeIds: [], referencedFunctionUuids: [],
        ownerComponentUuid: findOwnerComponent(contextMenu.node) ?? "",
      } satisfies SequenceDiagramNode
    }

    addNode(contextMenu.node.uuid, newNode)
    selectNode(uuid)
  }

  type MenuItem = { label: string; onClick: () => void; icon?: React.ReactNode; className?: string }

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

    if (node.type === "actor" || node.type === "component") {
      const nodeParent = findParentNode(rootComponent, node.uuid)
      if (nodeParent?.type === "component" && isNodeOrphaned(node, nodeParent)) {
        items.push({
          label: "Delete",
          onClick: () => handleDeleteNode(),
          icon: <Trash2 size={14} />,
          className: "text-red-400 hover:bg-red-900/20",
        })
      }
    }

    return items
  }

  const getMenuItems = () => {
    if (!contextMenu) return []
    return computeMenuItems(contextMenu.node)
  }

  const handleDeleteNode = () => {
    if (!contextMenu) return
    if (
      confirm(`Are you sure you want to delete "${contextMenu.node.name}"?`)
    ) {
      deleteNode(contextMenu.node.uuid)
      setContextMenu(null)
    }
  }

  return (
    <>
      <div className="p-4 border-b border-gray-800 font-semibold text-gray-300 bg-gray-800/50 backdrop-blur-sm flex items-center justify-between">
        <span className="flex items-center gap-2">
          System Explorer
          {hasUnsavedChanges && (
            <span className="text-xs font-normal text-yellow-500" title="Unsaved changes">●</span>
          )}
        </span>
        <div className="flex gap-1">
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
    </>
  )
}
