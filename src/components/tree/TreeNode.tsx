import { useState } from "react"
import { ChevronRight, ChevronDown, Trash2 } from "lucide-react"
import { useSystemStore } from "../../store/useSystemStore"
import type { Node, ComponentNode } from "../../store/types"
import { isNodeOrphaned, isUseCaseReferenced, findParentNode } from "../../utils/nodeUtils"
import { NodeIcon } from "./NodeIcon"

interface TreeNodeProps {
  node: Node
  onContextMenu: (e: React.MouseEvent, node: Node) => void
  parent?: ComponentNode
}

export const TreeNode = ({ node, onContextMenu, parent }: TreeNodeProps) => {
  const [expanded, setExpanded] = useState(true)
  const [hovered, setHovered] = useState(false)
  const selectedNodeId = useSystemStore((state) => state.selectedNodeId)
  const selectNode = useSystemStore((state) => state.selectNode)
  const deleteNode = useSystemStore((state) => state.deleteNode)
  const rootComponent = useSystemStore((state) => state.rootComponent)

  const isSelected = selectedNodeId === node.uuid
  const isOrphaned = parent ? isNodeOrphaned(node, rootComponent) : false

  const isDeletable = (() => {
    if (node.uuid === rootComponent.uuid) return false
    if (node.type === "actor" || node.type === "component") {
      const nodeParent = parent ?? findParentNode(rootComponent, node.uuid) as ComponentNode | null
      return nodeParent?.type === "component" && isNodeOrphaned(node, rootComponent)
    }
    if (node.type === "use-case") {
      return !isUseCaseReferenced(rootComponent, node.uuid)
    }
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
    deleteNode(node.uuid)
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
