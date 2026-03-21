import { useState, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/shallow'
import { useSystemStore } from '../store/useSystemStore'
import type { Node, ComponentNode, UseCaseDiagramNode, SequenceDiagramNode } from '../store/types'
import { ContextMenu } from './ContextMenu'
import { CreateNodeDialog } from './CreateNodeDialog'
import { TreeNode } from './tree/TreeNode'
import { TreeToolbar } from './tree/TreeToolbar'
import { findParentNode } from '../nodes/nodeTree'

export const TreeView = () => {
    const { rootComponent, addNode, selectNode, selectedNodeId, uiMode } = useSystemStore(
        useShallow((s) => ({
            rootComponent: s.rootComponent,
            addNode: s.addNode,
            selectNode: s.selectNode,
            selectedNodeId: s.selectedNodeId,
            uiMode: s.uiMode,
        }))
    )
    const readOnly = uiMode === 'browse'

    const treeRef = useRef<HTMLDivElement>(null)
    const treeActive = useRef(false)

    const [contextMenu, setContextMenu] = useState<{
        x: number
        y: number
        node: Node
    } | null>(null)

    const [createDialog, setCreateDialog] = useState<{
        title: string
        placeholder: string
        onConfirm: (id: string, name: string) => void
    } | null>(null)

    // Track whether the tree panel is "active" (last interacted with).
    useEffect(() => {
        const onPointer = (e: PointerEvent) => {
            treeActive.current = !!(
                treeRef.current &&
                e.target instanceof globalThis.Node &&
                treeRef.current.contains(e.target)
            )
        }
        document.addEventListener('pointerdown', onPointer)
        return () => document.removeEventListener('pointerdown', onPointer)
    }, [])

    // Navigating to a node via a diagram link also activates the tree.
    useEffect(() => {
        if (selectedNodeId) treeActive.current = true
    }, [selectedNodeId])

    const handleCloseContextMenu = () => {
        setContextMenu(null)
    }

    const handleAddSubComponent = () => {
        if (!contextMenu) return
        const parentUuid = contextMenu.node.uuid
        setContextMenu(null)
        setCreateDialog({
            title: 'Add Sub-component',
            placeholder: 'my_service',
            onConfirm: (id, name) => {
                const uuid = crypto.randomUUID()
                const newNode: ComponentNode = {
                    uuid,
                    id,
                    name,
                    type: 'component',
                    subComponents: [],
                    actors: [],
                    useCaseDiagrams: [],
                    interfaces: [],
                }
                addNode(parentUuid, newNode)
                selectNode(uuid)
                setCreateDialog(null)
            },
        })
    }

    const handleAddNode = (type: 'use-case-diagram' | 'sequence-diagram') => {
        if (!contextMenu) return
        const parentNode = contextMenu.node
        const label = type === 'use-case-diagram' ? 'use case diagram' : 'sequence diagram'
        setContextMenu(null)

        const findOwnerComponent = (node: Node): string | null => {
            const nodeParent = findParentNode(rootComponent, node.uuid)
            if (!nodeParent) return null
            if (nodeParent.type === 'component') return nodeParent.uuid
            return findOwnerComponent(nodeParent)
        }

        setCreateDialog({
            title: `Add ${label.charAt(0).toUpperCase() + label.slice(1)}`,
            placeholder: 'my_feature',
            onConfirm: (id, name) => {
                const uuid = crypto.randomUUID()
                let newNode: Node
                if (type === 'use-case-diagram') {
                    newNode = {
                        uuid,
                        id,
                        name,
                        type,
                        content: '',
                        description: '',
                        referencedNodeIds: [],
                        ownerComponentUuid: parentNode.uuid,
                        useCases: [],
                    } satisfies UseCaseDiagramNode
                } else {
                    newNode = {
                        uuid,
                        id,
                        name,
                        type,
                        content: '',
                        description: '',
                        referencedNodeIds: [],
                        referencedFunctionUuids: [],
                        ownerComponentUuid: findOwnerComponent(parentNode) ?? '',
                    } satisfies SequenceDiagramNode
                }
                addNode(parentNode.uuid, newNode)
                selectNode(uuid)
                setCreateDialog(null)
            },
        })
    }

    type MenuItem = {
        label: string
        onClick: () => void
        icon?: React.ReactNode
        className?: string
    }

    const computeMenuItems = (node: Node): MenuItem[] => {
        const items: MenuItem[] = []
        if (node.type === 'component') {
            items.push({ label: 'Add Sub-component', onClick: () => handleAddSubComponent() })
            items.push({
                label: 'Add Use Case Diagram',
                onClick: () => handleAddNode('use-case-diagram'),
            })
        } else if (node.type === 'use-case') {
            items.push({
                label: 'Add Sequence Diagram',
                onClick: () => handleAddNode('sequence-diagram'),
            })
        }
        return items
    }

    const getMenuItems = () => {
        if (!contextMenu) return []
        return computeMenuItems(contextMenu.node)
    }

    const handleContextMenu = (e: React.MouseEvent, node: Node) => {
        if (readOnly) return
        e.preventDefault()
        const items = computeMenuItems(node)
        if (items.length === 0) return
        setContextMenu({ x: e.clientX, y: e.clientY, node })
    }

    if (!rootComponent) return <div className="p-4 text-sm text-gray-500">No system defined</div>

    return (
        <div ref={treeRef} className="contents">
            <TreeToolbar treeActive={treeActive} />
            <div className="flex-1 overflow-auto pb-8">
                <TreeNode
                    node={rootComponent}
                    onContextMenu={handleContextMenu}
                    readOnly={readOnly}
                />
                {!readOnly && contextMenu && (
                    <ContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        onClose={handleCloseContextMenu}
                        items={getMenuItems()}
                    />
                )}
            </div>
            {!readOnly && createDialog && (
                <CreateNodeDialog
                    title={createDialog.title}
                    placeholder={createDialog.placeholder}
                    onConfirm={createDialog.onConfirm}
                    onCancel={() => setCreateDialog(null)}
                />
            )}
        </div>
    )
}
