import { useState } from 'react'
import { useSystemStore } from '../../store/useSystemStore'
import type { ComponentNode, InterfaceSpecification } from '../../store/types'
import { newInterfaceUuid } from '../../store/types'
import { findParentNode } from '../../nodes/nodeTree'
import { resolveComponentInterfaces, type ResolvedInterface } from '../../utils/interfaceFunctions'

export interface InterfaceTabManager {
    activeTabUuid: string | null
    setActiveTabUuid: (uuid: string | null) => void
    resolvedInterfaces: ReadonlyArray<ResolvedInterface>
    parentComponent: ComponentNode | null
    parentInterfaces: ReadonlyArray<InterfaceSpecification>
    uninheritedParentInterfaces: ReadonlyArray<InterfaceSpecification>
    handleInheritParentInterface: (
        parentUuid: string,
        onUpdate: (updates: Partial<ComponentNode>) => void
    ) => void
}

function resolveParentComponent(
    rootComponent: ComponentNode,
    nodeUuid: string
): ComponentNode | null {
    const parentNode = findParentNode(rootComponent, nodeUuid)
    return parentNode?.type === 'component' ? parentNode : null
}

function getSelectedNodeInterfaceUuid(
    node: ComponentNode,
    selectedInterfaceUuid: string | null
): string | null {
    if (selectedInterfaceUuid == null) return null
    return node.interfaces.some((iface) => iface.uuid === selectedInterfaceUuid)
        ? selectedInterfaceUuid
        : null
}

function getFirstInterfaceUuid(node: ComponentNode): string | null {
    return node.interfaces[0]?.uuid ?? null
}

function getInitialActiveTabUuid(
    node: ComponentNode,
    selectedInterfaceUuid: string | null
): string | null {
    return getSelectedNodeInterfaceUuid(node, selectedInterfaceUuid) ?? getFirstInterfaceUuid(node)
}

export function useInterfaceTabManager(node: ComponentNode): InterfaceTabManager {
    const rootComponent = useSystemStore((state) => state.rootComponent)
    const selectedInterfaceUuid = useSystemStore((s) => s.selectedInterfaceUuid)

    const parentComponent = resolveParentComponent(rootComponent, node.uuid)
    const parentInterfaces: ReadonlyArray<InterfaceSpecification> =
        parentComponent?.interfaces ?? []

    const uninheritedParentInterfaces = parentInterfaces.filter(
        (pi) =>
            !node.interfaces.some(
                (iface) => iface.kind === 'inherited' && iface.parentInterfaceUuid === pi.uuid
            )
    )

    const resolvedInterfaces = resolveComponentInterfaces(node, rootComponent)

    // On initial mount, prefer selectedInterfaceUuid if it belongs to this component.
    const [activeTabUuid, setActiveTabUuid] = useState<string | null>(
        getInitialActiveTabUuid(node, selectedInterfaceUuid)
    )

    // Reset to first tab (or the already-selected interface) when the selected node changes.
    // Uses React's render-time state adjustment pattern to avoid useEffect/set-state-in-effect.
    // See: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
    const [prevNodeUuid, setPrevNodeUuid] = useState<string>(node.uuid)
    if (node.uuid !== prevNodeUuid) {
        setPrevNodeUuid(node.uuid)
        setActiveTabUuid(getInitialActiveTabUuid(node, selectedInterfaceUuid))
    }

    // Switch to the clicked interface's tab when a function is clicked in the sequence diagram.
    const [prevSelectedIfaceUuid, setPrevSelectedIfaceUuid] = useState<string | null>(
        selectedInterfaceUuid
    )
    if (selectedInterfaceUuid !== prevSelectedIfaceUuid) {
        setPrevSelectedIfaceUuid(selectedInterfaceUuid)
        const matchedInterfaceUuid = getSelectedNodeInterfaceUuid(node, selectedInterfaceUuid)
        if (matchedInterfaceUuid) setActiveTabUuid(matchedInterfaceUuid)
    }

    const handleInheritParentInterface = (
        parentUuid: string,
        onUpdate: (updates: Partial<ComponentNode>) => void
    ) => {
        const parentIface = parentInterfaces.find((pi) => pi.uuid === parentUuid)
        if (!parentIface) return
        const newIface: InterfaceSpecification = {
            kind: 'inherited',
            uuid: newInterfaceUuid(),
            id: parentIface.id,
            name: parentIface.name,
            type: parentIface.type,
            parentInterfaceUuid: parentIface.uuid,
            functions: [],
        }
        onUpdate({ interfaces: [...node.interfaces, newIface] })
        setActiveTabUuid(newIface.uuid)
    }

    return {
        activeTabUuid,
        setActiveTabUuid,
        resolvedInterfaces,
        parentComponent,
        parentInterfaces,
        uninheritedParentInterfaces,
        handleInheritParentInterface,
    }
}
