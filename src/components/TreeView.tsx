import { useState } from "react"
import {
  ChevronRight,
  ChevronDown,
  Folder,
  Box,
  User,
  FileText,
  Activity,
  Download,
  Upload,
  Trash2,
} from "lucide-react"
import { useSystemStore } from "../store/useSystemStore"
import type { Node, ComponentNode } from "../store/types"
import { ContextMenu } from "./ContextMenu"
import yaml from "js-yaml"
import { isNodeOrphaned, findParentNode } from "../utils/nodeUtils"

interface TreeNodeProps {
  node: Node
  level?: number
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
      return <Activity size={16} className="text-red-500" />
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
    // use-case-diagrams, use-cases, sequence-diagrams are always deletable
    return true
  })()

  let children: Node[] = []
  if (node.type === "component") {
    const comp = node as ComponentNode
    children = [
      ...comp.subComponents,
      ...comp.actors,
      ...comp.useCaseDiagrams,
    ]
  } else if (node.type === "use-case-diagram") {
    const diagram = node as any
    children = diagram.useCases || []
  } else if (node.type === "use-case") {
    const useCase = node as any
    children = useCase.sequenceDiagrams || []
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
        className={`flex items-center py-1 px-2 cursor-pointer rounded select-none text-[0.9rem] text-gray-300 hover:bg-gray-800 ${
          isSelected ? "bg-sky-900/50 text-sky-300" : ""
        }`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          className="w-4 h-4 flex items-center justify-center mr-1 text-gray-500 hover:text-gray-400"
          onClick={hasChildren ? handleToggle : undefined}
        >
          {hasChildren &&
            (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
        </div>
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

export const TreeView = () => {
  const rootComponent = useSystemStore((state) => state.rootComponent)
  const setSystem = useSystemStore((state) => state.setSystem)
  const addNode = useSystemStore((state) => state.addNode)
  const selectNode = useSystemStore((state) => state.selectNode)
  const deleteNode = useSystemStore((state) => state.deleteNode)

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    node: Node
  } | null>(null)

  const handleSave = () => {
    try {
      const yamlContent = yaml.dump(rootComponent, {
        indent: 2,
        noRefs: true,
        skipInvalid: true,
      })

      const blob = new Blob([yamlContent], { type: "text/yaml" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${rootComponent.name.toLowerCase().replace(/\s+/g, "-")}.yaml`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Failed to save system:", error)
      alert("Failed to save system: " + (error as Error).message)
    }
  }

  const handleLoad = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".yaml,.yml"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const loadedSystem = yaml.load(text) as ComponentNode

        // Validate basic structure
        if (
          !loadedSystem ||
          typeof loadedSystem !== "object" ||
          loadedSystem.type !== "component"
        ) {
          throw new Error("Invalid system file format")
        }

        // setSystem will parse all diagrams to rebuild referencedNodeIds
        setSystem(loadedSystem)
      } catch (error) {
        console.error("Failed to load system:", error)
        alert("Failed to load system: " + (error as Error).message)
      }
    }
    input.click()
  }

  if (!rootComponent)
    return <div className="p-4 text-sm text-gray-500">No system defined</div>

  const handleContextMenu = (e: React.MouseEvent, node: Node) => {
    e.preventDefault()
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

    const id = name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now()

    const newNode: any = {
      uuid: crypto.randomUUID(),
      id,
      name,
      type,
      content: "",
      description: "",
      referencedNodeIds: [],
    }

    // Set ownerComponentUuid for diagrams
    if (type === "use-case-diagram") {
      // Use case diagram added to component
      newNode.ownerComponentUuid = contextMenu.node.uuid
      newNode.useCases = []
    } else if (type === "use-case") {
      // Use case added to use case diagram
      newNode.sequenceDiagrams = []
    } else if (type === "sequence-diagram") {
      // Sequence diagram added to use case
      // Find owner component by traversing up
      const findOwnerComponent = (node: Node): string | null => {
        const parent = findParentNode(rootComponent, node.uuid)
        if (!parent) return null
        if (parent.type === "component") return parent.uuid
        return findOwnerComponent(parent)
      }
      newNode.ownerComponentUuid = findOwnerComponent(contextMenu.node)
    }

    addNode(contextMenu.node.uuid, newNode)
    selectNode(newNode.uuid)
  }

  const getMenuItems = () => {
    if (!contextMenu) return []
    const { node } = contextMenu

    const items = []

    if (node.type === "component") {
      items.push({
        label: "Add Use Case Diagram",
        onClick: () => handleAddNode("use-case-diagram"),
      })
    } else if (node.type === "use-case-diagram") {
      items.push({
        label: "Add Use Case",
        onClick: () => handleAddNode("use-case"),
      })
    } else if (node.type === "use-case") {
      items.push({
        label: "Add Sequence Diagram",
        onClick: () => handleAddNode("sequence-diagram"),
      })
    }

    // Check if node is orphaned and can be deleted
    if (node.type === "actor" || node.type === "component") {
      const parent = findParentNode(rootComponent, node.uuid)
      if (parent && parent.type === "component" && isNodeOrphaned(node, parent)) {
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
        <span>System Explorer</span>
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
