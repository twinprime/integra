import type {
    ComponentNode,
    InheritedInterfaceSpecification,
    InterfaceFunction,
    InterfaceSpecification,
    LocalInterfaceSpecification,
} from '../store/types'
import { findParentNode } from '../nodes/nodeTree'

export type ResolvedInterface =
    | (LocalInterfaceSpecification & {
          readonly effectiveFunctions: ReadonlyArray<InterfaceFunction>
          readonly inheritedFrom: null
          readonly isDangling: false
      })
    | (InheritedInterfaceSpecification & {
          readonly effectiveFunctions: ReadonlyArray<InterfaceFunction>
          readonly inheritedFrom: LocalInterfaceSpecification | null
          readonly isDangling: boolean
      })

export function isInheritedInterface(
    iface: InterfaceSpecification
): iface is InheritedInterfaceSpecification {
    return iface.kind === 'inherited' || 'parentInterfaceUuid' in iface
}

export function isLocalInterface(
    iface: InterfaceSpecification
): iface is LocalInterfaceSpecification {
    return !isInheritedInterface(iface)
}

export function getStoredInterfaceFunctions(
    iface: InterfaceSpecification
): ReadonlyArray<InterfaceFunction> {
    return isLocalInterface(iface) ? iface.functions : []
}

export function getParentInterface(
    iface: InheritedInterfaceSpecification,
    ownerComp: ComponentNode,
    rootComponent: ComponentNode
): LocalInterfaceSpecification | null {
    const parentNode = findParentNode(rootComponent, ownerComp.uuid)
    if (parentNode?.type !== 'component') return null
    const parentIface = parentNode.interfaces.find(
        (candidate) => candidate.uuid === iface.parentInterfaceUuid
    )
    return parentIface && isLocalInterface(parentIface) ? parentIface : null
}

/**
 * Returns the effective readable function list for an interface.
 *
 * Inherited interfaces source their function contract from the parent interface
 * instead of storing local functions. Read/lookup/render paths should use this
 * helper instead of reading stored functions directly.
 */
export function resolveEffectiveInterfaceFunctions(
    iface: InterfaceSpecification,
    ownerComp: ComponentNode,
    rootComponent: ComponentNode
): ReadonlyArray<InterfaceFunction> {
    if (isLocalInterface(iface)) return iface.functions
    return getParentInterface(iface, ownerComp, rootComponent)?.functions ?? []
}

export function resolveInterface(
    iface: InterfaceSpecification,
    ownerComp: ComponentNode,
    rootComponent: ComponentNode
): ResolvedInterface {
    if (isLocalInterface(iface)) {
        return {
            ...iface,
            effectiveFunctions: iface.functions,
            inheritedFrom: null,
            isDangling: false,
        }
    }

    const inheritedFrom = getParentInterface(iface, ownerComp, rootComponent)
    return {
        ...iface,
        effectiveFunctions: inheritedFrom?.functions ?? [],
        inheritedFrom,
        isDangling: inheritedFrom == null,
    }
}

export function resolveComponentInterfaces(
    ownerComp: ComponentNode,
    rootComponent: ComponentNode
): ReadonlyArray<ResolvedInterface> {
    return ownerComp.interfaces.map((iface) => resolveInterface(iface, ownerComp, rootComponent))
}
