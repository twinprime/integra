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
          readonly localFunctions: ReadonlyArray<InterfaceFunction>
          readonly inheritedFunctions: ReadonlyArray<InterfaceFunction>
          readonly inheritedFrom: null
          readonly isDangling: false
      })
    | (InheritedInterfaceSpecification & {
          readonly effectiveFunctions: ReadonlyArray<InterfaceFunction>
          readonly localFunctions: ReadonlyArray<InterfaceFunction>
          readonly inheritedFunctions: ReadonlyArray<InterfaceFunction>
          readonly inheritedFrom: LocalInterfaceSpecification | null
          readonly isDangling: boolean
      })

export type InheritedChildFunctionConflict = {
    readonly componentUuid: string
    readonly componentName: string
    readonly interfaceUuid: string
    readonly interfaceId: string
    readonly functionUuid: string
    readonly functionId: string
}

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
    return iface.functions
}

export function paramsMatch(
    a: ReadonlyArray<InterfaceFunction['parameters'][number]>,
    b: ReadonlyArray<InterfaceFunction['parameters'][number]>
): boolean {
    if (a.length !== b.length) return false
    return a.every(
        (p, i) => p.name === b[i].name && p.type === b[i].type && p.required === b[i].required
    )
}

export function functionSignatureKey(
    functionId: string,
    parameters: ReadonlyArray<InterfaceFunction['parameters'][number]>
): string {
    return [
        functionId,
        ...parameters.map((p) => `${p.name}:${p.type}:${p.required ? 'required' : 'optional'}`),
    ].join('|')
}

function mergeInheritedAndLocalFunctions(
    inheritedFunctions: ReadonlyArray<InterfaceFunction>,
    localFunctions: ReadonlyArray<InterfaceFunction>
): ReadonlyArray<InterfaceFunction> {
    const seen = new Set<string>()
    const merged: InterfaceFunction[] = []

    for (const fn of localFunctions) {
        const key = functionSignatureKey(fn.id, fn.parameters)
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(fn)
    }

    for (const fn of inheritedFunctions) {
        const key = functionSignatureKey(fn.id, fn.parameters)
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(fn)
    }

    return merged
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
    const inheritedFunctions = getParentInterface(iface, ownerComp, rootComponent)?.functions ?? []
    return mergeInheritedAndLocalFunctions(inheritedFunctions, iface.functions)
}

export function findInheritedParentFunction(
    iface: InheritedInterfaceSpecification,
    ownerComp: ComponentNode,
    rootComponent: ComponentNode,
    functionId: string,
    parameters: ReadonlyArray<InterfaceFunction['parameters'][number]>
): InterfaceFunction | null {
    const parentIface = getParentInterface(iface, ownerComp, rootComponent)
    if (!parentIface) return null
    return (
        parentIface.functions.find(
            (candidate) =>
                candidate.id === functionId && paramsMatch(candidate.parameters, parameters)
        ) ?? null
    )
}

export function findConflictingInheritedChildFunctions(
    rootComponent: ComponentNode,
    parentInterfaceUuid: string,
    functionId: string,
    parameters: ReadonlyArray<InterfaceFunction['parameters'][number]>
): ReadonlyArray<InheritedChildFunctionConflict> {
    const conflicts: InheritedChildFunctionConflict[] = []

    const walk = (component: ComponentNode): void => {
        for (const iface of component.interfaces) {
            if (!isInheritedInterface(iface) || iface.parentInterfaceUuid !== parentInterfaceUuid)
                continue
            for (const fn of iface.functions) {
                if (fn.id === functionId && paramsMatch(fn.parameters, parameters)) {
                    conflicts.push({
                        componentUuid: component.uuid,
                        componentName: component.name,
                        interfaceUuid: iface.uuid,
                        interfaceId: iface.id,
                        functionUuid: fn.uuid,
                        functionId: fn.id,
                    })
                }
            }
        }
        for (const child of component.subComponents) walk(child)
    }

    walk(rootComponent)
    return conflicts
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
            localFunctions: iface.functions,
            inheritedFunctions: [],
            inheritedFrom: null,
            isDangling: false,
        }
    }

    const inheritedFrom = getParentInterface(iface, ownerComp, rootComponent)
    const inheritedFunctions = inheritedFrom?.functions ?? []
    const localFunctions = iface.functions
    return {
        ...iface,
        effectiveFunctions: mergeInheritedAndLocalFunctions(inheritedFunctions, localFunctions),
        localFunctions,
        inheritedFunctions,
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
