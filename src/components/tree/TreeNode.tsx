import { useEffect, useRef, useState, memo } from 'react'
import { ChevronRight, ChevronDown, Trash2, GripVertical } from 'lucide-react'
import { useSystemStore } from '../../store/useSystemStore'
import type { Node, ComponentNode } from '../../store/types'
import { isNodeOrphaned } from '../../utils/nodeUtils'
import { getNodeHandler } from '../../nodes/nodeTree'
import { NodeIcon } from './NodeIcon'
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface TreeNodeProps {
    node: Node
    onContextMenu: (e: React.MouseEvent, node: Node) => void
    parent?: ComponentNode
}

interface SortableChildrenProps {
    items: ReadonlyArray<Node>
    onContextMenu: (e: React.MouseEvent, node: Node) => void
}

function subtreeContainsNode(node: Node, targetUuid: string | null): boolean {
    if (!targetUuid) return false
    if (node.uuid === targetUuid) return true
    if (node.type === 'component') {
        return [...node.subComponents, ...node.actors, ...node.useCaseDiagrams].some((child) =>
            subtreeContainsNode(child, targetUuid)
        )
    }
    if (node.type === 'use-case-diagram') {
        return node.useCases.some((child) => subtreeContainsNode(child, targetUuid))
    }
    if (node.type === 'use-case') {
        return node.sequenceDiagrams.some((child) => subtreeContainsNode(child, targetUuid))
    }
    return false
}

/** Renders a SortableContext group of TreeNodes. Must be placed inside a DndContext. */
const SortableChildren = ({ items, onContextMenu }: SortableChildrenProps) => (
    <SortableContext items={items.map((n) => n.uuid)} strategy={verticalListSortingStrategy}>
        {items.map((child) => (
            <TreeNode key={child.uuid} node={child} onContextMenu={onContextMenu} />
        ))}
    </SortableContext>
)

export const TreeNode = memo(({ node, onContextMenu }: TreeNodeProps) => {
    const [expanded, setExpanded] = useState(true)
    const [hovered, setHovered] = useState(false)
    const rowRef = useRef<HTMLDivElement | null>(null)
    const selectedNodeId = useSystemStore((state) => state.selectedNodeId)
    const selectNode = useSystemStore((state) => state.selectNode)
    const deleteNode = useSystemStore((state) => state.deleteNode)
    const rootComponent = useSystemStore((state) => state.rootComponent)
    const reorderNode = useSystemStore((state) => state.reorderNode)

    const isSelected = selectedNodeId === node.uuid
    const isDeletable = node.uuid !== rootComponent.uuid && isNodeOrphaned(node, rootComponent)
    const isOrphaned = isDeletable && !!getNodeHandler(node.type).orphanWhenUnreferenced

    let children: ReadonlyArray<Node> = []
    if (node.type === 'component') {
        children = [...node.subComponents, ...node.actors, ...node.useCaseDiagrams]
    } else if (node.type === 'use-case-diagram') {
        children = node.useCases
    } else if (node.type === 'use-case') {
        children = node.sequenceDiagrams
    }

    const hasChildren = children.length > 0

    const autoExpanded =
        hasChildren && children.some((child) => subtreeContainsNode(child, selectedNodeId))
    const isExpanded = expanded || autoExpanded

    useEffect(() => {
        if (isSelected) {
            rowRef.current?.scrollIntoView({ block: 'nearest' })
        }
    }, [isSelected])

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: node.uuid,
    })

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id) return
        reorderNode(node.uuid, active.id as string, over.id as string)
    }

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

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    const renderSortableChildren = () => {
        if (node.type === 'component') {
            return (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    {node.subComponents.length > 0 && (
                        <SortableChildren
                            items={node.subComponents}
                            onContextMenu={onContextMenu}
                        />
                    )}
                    {node.actors.length > 0 && (
                        <SortableChildren items={node.actors} onContextMenu={onContextMenu} />
                    )}
                    {node.useCaseDiagrams.length > 0 && (
                        <SortableChildren
                            items={node.useCaseDiagrams}
                            onContextMenu={onContextMenu}
                        />
                    )}
                </DndContext>
            )
        }
        if (node.type === 'use-case-diagram') {
            return (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableChildren items={node.useCases} onContextMenu={onContextMenu} />
                </DndContext>
            )
        }
        if (node.type === 'use-case') {
            return (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableChildren items={node.sequenceDiagrams} onContextMenu={onContextMenu} />
                </DndContext>
            )
        }
        return null
    }

    return (
        <div className="pl-4">
            <div
                ref={(element) => {
                    rowRef.current = element
                    setNodeRef(element)
                }}
                {...attributes}
                role="treeitem"
                aria-selected={isSelected}
                tabIndex={0}
                className={`group flex items-center py-1 px-2 cursor-pointer rounded select-none text-[0.9rem] text-gray-300 hover:bg-gray-800 ${
                    isSelected ? 'bg-sky-900/50 text-sky-300' : ''
                } ${isDragging ? 'opacity-40' : ''}`}
                style={style}
                onClick={handleClick}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleClick()
                }}
                onContextMenu={handleContextMenu}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                <button
                    tabIndex={-1}
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    className="w-4 h-4 flex items-center justify-center mr-1 text-gray-500 hover:text-gray-400 bg-transparent border-0 p-0 cursor-pointer"
                    onClick={hasChildren ? handleToggle : undefined}
                >
                    {hasChildren &&
                        (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                </button>
                <div className="mr-2 w-4 h-4">
                    <NodeIcon type={node.type} />
                </div>
                <div
                    className={`flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${
                        isOrphaned ? 'line-through text-gray-500' : ''
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
                <span
                    {...listeners}
                    className="ml-1 p-0.5 text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Drag to reorder"
                >
                    <GripVertical size={12} />
                </span>
            </div>

            {hasChildren && isExpanded && <div>{renderSortableChildren()}</div>}
        </div>
    )
})

TreeNode.displayName = 'TreeNode'
