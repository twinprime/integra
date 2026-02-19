import { useState } from "react"
import {
  ChevronRight,
  ChevronDown,
  Folder,
  Box,
  User,
  FileText,
  Layout,
  Activity,
} from "lucide-react"
import { useSystemStore } from "../store/useSystemStore"
import type { Node, SystemNode, ComponentNode } from "../store/types"
import { ContextMenu } from "./ContextMenu"

interface TreeNodeProps {
  node: Node
  level?: number
  onContextMenu: (e: React.MouseEvent, node: Node) => void
}

const NodeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "system":
      return <Layout size={16} className="text-purple-500" />
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

const TreeNode = ({ node, onContextMenu }: TreeNodeProps) => {
  const [expanded, setExpanded] = useState(true)
  const selectedNodeId = useSystemStore((state) => state.selectedNodeId)
  const selectNode = useSystemStore((state) => state.selectNode)

  const isSelected = selectedNodeId === node.uuid

  let children: Node[] = []
  if (node.type === "system") {
    const sys = node as SystemNode
    children = [
      ...sys.components,
      ...sys.actors,
      ...sys.useCases,
      ...sys.useCaseDiagrams,
      ...sys.sequenceDiagrams,
    ]
  } else if (node.type === "component") {
    const comp = node as ComponentNode
    children = [
      ...comp.subComponents,
      ...comp.actors,
      ...comp.useCases,
      ...comp.useCaseDiagrams,
      ...comp.sequenceDiagrams,
    ]
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

  return (
    <div className="pl-4">
      <div
        className={`flex items-center py-1 px-2 cursor-pointer rounded select-none text-[0.9rem] text-gray-300 hover:bg-gray-800 ${
          isSelected ? "bg-sky-900/50 text-sky-300" : ""
        }`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
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
        <div className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {node.name}
        </div>
      </div>

      {hasChildren && expanded && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const TreeView = () => {
  const system = useSystemStore((state) => state.system)
  const addNode = useSystemStore((state) => state.addNode)
  const selectNode = useSystemStore((state) => state.selectNode)

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    node: Node
  } | null>(null)

  if (!system)
    return <div className="p-4 text-sm text-gray-500">No system defined</div>

  const handleContextMenu = (e: React.MouseEvent, node: Node) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }

  const handleCloseContextMenu = () => {
    setContextMenu(null)
  }

  const handleAddNode = (type: "use-case-diagram" | "sequence-diagram") => {
    if (!contextMenu) return

    const name = prompt(
      "Enter diagram name",
      `New ${type === "use-case-diagram" ? "Use Case" : "Sequence"} Diagram`
    )
    if (!name) return

    const id = name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now()

    const newNode: any = {
      uuid: crypto.randomUUID(),
      id,
      name,
      type,
      content: "",
      description: "",
    }

    addNode(contextMenu.node.uuid, newNode)
    selectNode(newNode.uuid)
  }

  const getMenuItems = () => {
    if (!contextMenu) return []
    const { node } = contextMenu

    if (node.type === "system" || node.type === "component") {
      return [
        {
          label: "Add Use Case Diagram",
          onClick: () => handleAddNode("use-case-diagram"),
        },
        {
          label: "Add Sequence Diagram",
          onClick: () => handleAddNode("sequence-diagram"),
        },
      ]
    }
    return []
  }

  return (
    <div className="pb-8">
      <TreeNode node={system} onContextMenu={handleContextMenu} />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          items={getMenuItems()}
        />
      )}
    </div>
  )
}
