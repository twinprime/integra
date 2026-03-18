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
    parentInterfaces: ReadonlyArray<InterfaceSpecification>
    uninheritedParentInterfaces: ReadonlyArray<InterfaceSpecification>
    handleInheritParentInterface: (
        parentUuid: string,
        onUpdate: (updates: Partial<ComponentNode>) => void
    ) => void
}

export function useInterfaceTabManager(node: ComponentNode): InterfaceTabManager {
    const rootComponent = useSystemStore((state) => state.rootComponent)
    const selectedInterfaceUuid = useSystemStore((s) => s.selectedInterfaceUuid)

    const parentNode = findParentNode(rootComponent, node.uuid)
    const parentInterfaces: ReadonlyArray<InterfaceSpecification> =
        parentNode?.type === 'component' ? parentNode.interfaces : []

    const uninheritedParentInterfaces = parentInterfaces.filter(
        (pi) =>
            !node.interfaces.some(
                (iface) => iface.kind === 'inherited' && iface.parentInterfaceUuid === pi.uuid
            )
    )

    const resolvedInterfaces = resolveComponentInterfaces(node, rootComponent)

    // On initial mount, prefer selectedInterfaceUuid if it belongs to this component.
    const firstIfaceUuid = node.interfaces?.[0]?.uuid ?? null
    const selectedIfaceMatchesNode =
        selectedInterfaceUuid != null &&
        node.interfaces?.some((i) => i.uuid === selectedInterfaceUuid)
    const [activeTabUuid, setActiveTabUuid] = useState<string | null>(
        selectedIfaceMatchesNode ? selectedInterfaceUuid : firstIfaceUuid
    )

    // Reset to first tab (or the already-selected interface) when the selected node changes.
    // Uses React's render-time state adjustment pattern to avoid useEffect/set-state-in-effect.
    // See: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
    const [prevNodeUuid, setPrevNodeUuid] = useState<string>(node.uuid)
    if (node.uuid !== prevNodeUuid) {
        setPrevNodeUuid(node.uuid)
        const matchedOnNodeChange =
            selectedInterfaceUuid != null &&
            node.interfaces?.find((i) => i.uuid === selectedInterfaceUuid)
        setActiveTabUuid(
            matchedOnNodeChange ? selectedInterfaceUuid : (node.interfaces?.[0]?.uuid ?? null)
        )
    }

    // Switch to the clicked interface's tab when a function is clicked in the sequence diagram.
    const [prevSelectedIfaceUuid, setPrevSelectedIfaceUuid] = useState<string | null>(
        selectedInterfaceUuid
    )
    if (selectedInterfaceUuid !== prevSelectedIfaceUuid) {
        setPrevSelectedIfaceUuid(selectedInterfaceUuid)
        if (selectedInterfaceUuid) {
            const match = node.interfaces?.find((i) => i.uuid === selectedInterfaceUuid)
            if (match) setActiveTabUuid(selectedInterfaceUuid)
        }
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
        parentInterfaces,
        uninheritedParentInterfaces,
        handleInheritParentInterface,
    }
}
