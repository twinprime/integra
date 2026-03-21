import { useEffect, useMemo, useRef, useState, memo } from 'react'
import { ChevronRight, ChevronDown, Trash2, GripVertical, ListTodo } from 'lucide-react'
import { useSystemStore } from '../../store/useSystemStore'
import type { Node, ComponentNode } from '../../store/types'
import { isNodeOrphaned } from '../../utils/nodeUtils'
import { getNodeHandler } from '../../nodes/nodeTree'
import { NodeIcon } from './NodeIcon'
import { getAggregatedNodeTodos } from '../../utils/nodeTodos'
import { NodeTodoPopup } from './NodeTodoPopup'
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
    depth?: number
    readOnly?: boolean
}

interface SortableChildrenProps {
    items: ReadonlyArray<Node>
    onContextMenu: (e: React.MouseEvent, node: Node) => void
    depth: number
    readOnly?: boolean
}

type ChildGroups = ReadonlyArray<ReadonlyArray<Node>>

function getTreeNodeChildren(node: Node): ReadonlyArray<Node> {
    if (node.type === 'component') {
        return [...node.subComponents, ...node.actors, ...node.useCaseDiagrams]
    }
    if (node.type === 'use-case-diagram') {
        return node.useCases
    }
    if (node.type === 'use-case') {
        return node.sequenceDiagrams
    }
    return []
}

function subtreeContainsNode(node: Node, targetUuid: string | null): boolean {
    if (!targetUuid) return false
    if (node.uuid === targetUuid) return true
    return getTreeNodeChildren(node).some((child) => subtreeContainsNode(child, targetUuid))
}

function getChildGroups(node: Node): ChildGroups {
    switch (node.type) {
        case 'component':
            return [node.subComponents, node.actors, node.useCaseDiagrams]
        case 'use-case-diagram':
            return [node.useCases]
        case 'use-case':
            return [node.sequenceDiagrams]
        default:
            return []
    }
}

function supportsReorder(node: Node): boolean {
    return node.type === 'component' || node.type === 'use-case-diagram' || node.type === 'use-case'
}

function renderReadOnlyGroups(
    groups: ChildGroups,
    onContextMenu: (e: React.MouseEvent, node: Node) => void,
    depth: number,
    readOnly: boolean
) {
    return groups.map((group) =>
        group.map((child) => (
            <TreeNode
                key={child.uuid}
                node={child}
                onContextMenu={onContextMenu}
                depth={depth}
                readOnly={readOnly}
            />
        ))
    )
}

function renderSortableGroups(
    groups: ChildGroups,
    onContextMenu: (e: React.MouseEvent, node: Node) => void,
    depth: number,
    readOnly: boolean
) {
    return groups
        .filter((group) => group.length > 0)
        .map((group) => (
            <SortableChildren
                key={group[0].uuid}
                items={group}
                onContextMenu={onContextMenu}
                depth={depth}
                readOnly={readOnly}
            />
        ))
}

/** Renders a SortableContext group of TreeNodes. Must be placed inside a DndContext. */
const SortableChildren = ({ items, onContextMenu, depth, readOnly }: SortableChildrenProps) => (
    <SortableContext items={items.map((n) => n.uuid)} strategy={verticalListSortingStrategy}>
        {items.map((child) => (
            <TreeNode
                key={child.uuid}
                node={child}
                onContextMenu={onContextMenu}
                depth={depth}
                readOnly={readOnly}
            />
        ))}
    </SortableContext>
)

export const TreeNode = memo(
    ({ node, onContextMenu, depth = 0, readOnly = false }: TreeNodeProps) => {
        const [expanded, setExpanded] = useState(depth === 0)
        const [hovered, setHovered] = useState(false)
        const [todoPopupPosition, setTodoPopupPosition] = useState<{ x: number; y: number } | null>(
            null
        )
        const rowRef = useRef<HTMLDivElement | null>(null)
        const todoButtonRef = useRef<HTMLButtonElement | null>(null)
        const todoPopupRef = useRef<HTMLDivElement | null>(null)
        const selectedNodeId = useSystemStore((state) => state.selectedNodeId)
        const selectNode = useSystemStore((state) => state.selectNode)
        const deleteNode = useSystemStore((state) => state.deleteNode)
        const rootComponent = useSystemStore((state) => state.rootComponent)
        const reorderNode = useSystemStore((state) => state.reorderNode)

        const isSelected = selectedNodeId === node.uuid
        const isDeletable = node.uuid !== rootComponent.uuid && isNodeOrphaned(node, rootComponent)
        const isOrphaned = isDeletable && !!getNodeHandler(node.type).orphanWhenUnreferenced

        const aggregatedTodos = useMemo(
            () => getAggregatedNodeTodos(rootComponent, node.uuid),
            [rootComponent, node.uuid]
        )
        const hasTodos = aggregatedTodos.length > 0

        const children = getTreeNodeChildren(node)
        const childGroups = getChildGroups(node)
        const hasChildren = children.length > 0

        const autoExpanded =
            hasChildren && children.some((child) => subtreeContainsNode(child, selectedNodeId))
        const isExpanded = expanded || autoExpanded

        useEffect(() => {
            if (isSelected) {
                rowRef.current?.scrollIntoView({ block: 'nearest' })
            }
        }, [isSelected])

        useEffect(() => {
            if (!todoPopupPosition) return

            const handlePointerDown = (event: PointerEvent) => {
                const target = event.target
                if (!(target instanceof globalThis.Node)) return
                if (todoButtonRef.current?.contains(target)) return
                if (todoPopupRef.current?.contains(target)) return
                setTodoPopupPosition(null)
            }

            document.addEventListener('pointerdown', handlePointerDown)
            return () => document.removeEventListener('pointerdown', handlePointerDown)
        }, [todoPopupPosition])

        const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
            useSortable({
                id: node.uuid,
            })

        const sensors = useSensors(
            useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
        )

        const handleDragEnd = (event: DragEndEvent) => {
            if (readOnly) return
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
            if (readOnly) return
            onContextMenu(e, node)
        }

        const handleDelete = (e: React.MouseEvent) => {
            e.stopPropagation()
            deleteNode(node.uuid)
        }

        const handleTodoButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation()
            if (todoPopupPosition) {
                setTodoPopupPosition(null)
                return
            }
            const rect = e.currentTarget.getBoundingClientRect()
            setTodoPopupPosition({ x: rect.right, y: rect.top })
        }

        const handleTodoSelect = (nodeUuid: string) => {
            selectNode(nodeUuid)
            setTodoPopupPosition(null)
        }

        const style = {
            transform: CSS.Transform.toString(transform),
            transition,
        }

        const renderChildren = () => {
            if (readOnly || !supportsReorder(node)) {
                return renderReadOnlyGroups(childGroups, onContextMenu, depth + 1, readOnly)
            }

            return (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    {renderSortableGroups(childGroups, onContextMenu, depth + 1, readOnly)}
                </DndContext>
            )
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
                    {hasTodos && (
                        <button
                            ref={todoButtonRef}
                            type="button"
                            aria-label={`Show TODOs for ${node.name}`}
                            className="ml-1 rounded p-0.5 text-amber-400 hover:bg-amber-900/20 hover:text-amber-300"
                            onClick={handleTodoButtonClick}
                        >
                            <ListTodo size={12} />
                        </button>
                    )}
                    {!readOnly && isDeletable && hovered && (
                        <button
                            className="ml-1 p-0.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                            title={`Delete "${node.name}"`}
                            onClick={handleDelete}
                        >
                            <Trash2 size={12} />
                        </button>
                    )}
                    {!readOnly && (
                        <span
                            {...listeners}
                            className="ml-1 p-0.5 text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Drag to reorder"
                        >
                            <GripVertical size={12} />
                        </span>
                    )}
                </div>
                {hasTodos && todoPopupPosition && (
                    <div ref={todoPopupRef}>
                        <NodeTodoPopup
                            todos={aggregatedTodos}
                            position={todoPopupPosition}
                            onSelect={handleTodoSelect}
                        />
                    </div>
                )}

                {hasChildren && isExpanded && <div>{renderChildren()}</div>}
            </div>
        )
    }
)

TreeNode.displayName = 'TreeNode'
