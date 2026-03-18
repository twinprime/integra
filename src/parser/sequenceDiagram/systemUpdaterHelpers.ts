import type {
    ComponentNode,
    InterfaceFunction,
    InterfaceSpecification,
    LocalInterfaceSpecification,
    Parameter,
} from '../../store/types'
import { newFunctionUuid, newInterfaceUuid } from '../../store/types'
import { upsertNodeInTree } from '../../nodes/nodeTree'
import { findCompByUuid } from '../../nodes/nodeTree'
import { normalizeComponent } from '../../nodes/interfaceOps'
import { isInheritedInterface, isLocalInterface } from '../../utils/interfaceFunctions'

export function parseParameters(rawParams: string): Parameter[] {
    if (!rawParams.trim()) return []
    return rawParams.split(',').map((p) => {
        const trimmed = p.trim()
        const colonIdx = trimmed.indexOf(':')
        if (colonIdx === -1) return { name: trimmed, type: 'any', required: true }
        const name = trimmed.slice(0, colonIdx).trim()
        const rawType = trimmed.slice(colonIdx + 1).trim()
        const optional = rawType.endsWith('?')
        const type = optional ? rawType.slice(0, -1).trim() : rawType
        return { name, type: type || 'any', required: !optional }
    })
}

export function paramsToString(params: ReadonlyArray<Parameter>): string {
    return params.map((p) => `${p.name}: ${p.type}${p.required ? '' : '?'}`).join(', ')
}

export function paramsMatch(a: ReadonlyArray<Parameter>, b: ReadonlyArray<Parameter>): boolean {
    if (a.length !== b.length) return false
    return a.every(
        (p, i) => p.name === b[i].name && p.type === b[i].type && p.required === b[i].required
    )
}

export type FunctionMatch = {
    kind: 'compatible' | 'incompatible'
    interfaceId: string
    functionId: string
    functionUuid: string
    oldParams: ReadonlyArray<Parameter>
    newParams: ReadonlyArray<Parameter>
    affectedDiagramUuids: string[]
}

function findInterfaceByUuid(
    root: ComponentNode,
    uuid: string
): ComponentNode['interfaces'][number] | null {
    for (const iface of root.interfaces ?? []) {
        if (iface.uuid === uuid) return iface
    }
    for (const sub of root.subComponents) {
        const found = findInterfaceByUuid(sub, uuid)
        if (found) return found
    }
    return null
}

function functionExistsOnParentInterface(
    root: ComponentNode,
    iface: ComponentNode['interfaces'][number],
    functionId: string,
    newParams: Parameter[]
): boolean {
    if (!isInheritedInterface(iface)) return false
    const parentIface = findInterfaceByUuid(root, iface.parentInterfaceUuid)
    if (!parentIface || !isLocalInterface(parentIface)) return false
    return parentIface.functions.some(
        (f) => f.id === functionId && paramsMatch(f.parameters, newParams)
    )
}

function createLocalInterface(interfaceId: string): LocalInterfaceSpecification {
    return {
        kind: 'local',
        uuid: newInterfaceUuid(),
        id: interfaceId,
        name: interfaceId,
        type: 'rest',
        functions: [],
    }
}

function createInterfaceFunction(functionId: string, parameters: Parameter[]): InterfaceFunction {
    return {
        uuid: newFunctionUuid(),
        id: functionId,
        parameters,
    }
}

const INTERFACE_TYPE_OWNER: Record<string, 'sender' | 'receiver'> = {
    kafka: 'sender',
    rest: 'receiver',
    graphql: 'receiver',
    other: 'receiver',
}

export function applyFunctionToComponentByUuid(
    root: ComponentNode,
    uuid: string,
    interfaceId: string,
    functionId: string,
    rawParams: string
): ComponentNode {
    return upsertNodeInTree(root, uuid, (node) => {
        const comp = node as ComponentNode
        const interfaces = comp.interfaces ? [...comp.interfaces] : []
        let ifaceIdx = interfaces.findIndex((i) => i.id === interfaceId)
        if (ifaceIdx === -1) {
            interfaces.push(createLocalInterface(interfaceId))
            ifaceIdx = interfaces.length - 1
        }
        const currentInterface = interfaces[ifaceIdx]
        if (isInheritedInterface(currentInterface)) {
            const newParams = parseParameters(rawParams)
            if (functionExistsOnParentInterface(root, currentInterface, functionId, newParams)) {
                return comp
            }
            throw new Error(
                `Cannot add function "${functionId}" to interface "${interfaceId}": ` +
                    `this interface inherits from a parent and its functions are locked.`
            )
        }

        let iface: LocalInterfaceSpecification = {
            ...currentInterface,
            functions: [...currentInterface.functions],
        }
        const newParams = parseParameters(rawParams)
        const exactMatch = iface.functions.findIndex(
            (f) => f.id === functionId && paramsMatch(f.parameters, newParams)
        )
        if (exactMatch === -1) {
            const sameIdSameCount = iface.functions.find(
                (f) => f.id === functionId && f.parameters.length === newParams.length
            )
            if (sameIdSameCount) {
                throw new Error(
                    `Parameter mismatch for function "${functionId}" in interface "${interfaceId}": ` +
                        `existing (${paramsToString(sameIdSameCount.parameters)}) vs new (${paramsToString(newParams)})`
                )
            }
            iface = {
                ...iface,
                functions: [...iface.functions, createInterfaceFunction(functionId, newParams)],
            }
        }
        interfaces[ifaceIdx] = iface
        return normalizeComponent({ ...comp, interfaces })
    })
}

export function resolveExternalOwnerUuid(
    root: ComponentNode,
    fromExtUuid: string | undefined,
    toExtUuid: string | undefined,
    interfaceId: string
): string | undefined {
    if (toExtUuid !== undefined) {
        const comp = findCompByUuid(root, toExtUuid)
        const iface = comp?.interfaces?.find((i) => i.id === interfaceId)
        if (iface && INTERFACE_TYPE_OWNER[iface.type] === 'sender') {
            return fromExtUuid // sender-owned interface (e.g. kafka); sender must also be external
        }
        return toExtUuid // receiver owns (REST default)
    }
    // Only sender is external
    if (fromExtUuid !== undefined) {
        const comp = findCompByUuid(root, fromExtUuid)
        const iface = comp?.interfaces?.find((i) => i.id === interfaceId)
        if (iface && INTERFACE_TYPE_OWNER[iface.type] === 'sender') {
            return fromExtUuid // sender-owned and sender is external
        }
        // Receiver is local — falls through to workingComponents
    }
    return undefined
}

export function applyMessageToComponents(
    components: ReadonlyArray<ComponentNode>,
    from: string,
    to: string,
    interfaceId: string,
    functionId: string,
    rawParams: string,
    root: ComponentNode
): ReadonlyArray<ComponentNode> {
    const result = [...components]
    const receiverIdx = result.findIndex((c) => c.id === to)
    const senderIdx = result.findIndex((c) => c.id === from)

    // Determine which component owns the interface
    const receiverIface =
        receiverIdx >= 0
            ? result[receiverIdx].interfaces?.find((i) => i.id === interfaceId)
            : undefined
    let ownerIdx = receiverIdx
    if (receiverIface) {
        ownerIdx = INTERFACE_TYPE_OWNER[receiverIface.type] === 'sender' ? senderIdx : receiverIdx
    } else {
        const senderIface =
            senderIdx >= 0
                ? result[senderIdx].interfaces?.find((i) => i.id === interfaceId)
                : undefined
        if (senderIface && INTERFACE_TYPE_OWNER[senderIface.type] === 'sender') ownerIdx = senderIdx
    }

    if (ownerIdx < 0) return result

    const targetComp = result[ownerIdx]
    const interfaces: InterfaceSpecification[] = targetComp.interfaces
        ? [...targetComp.interfaces]
        : []

    let ifaceIdx = interfaces.findIndex((i) => i.id === interfaceId)
    if (ifaceIdx === -1) {
        interfaces.push(createLocalInterface(interfaceId))
        ifaceIdx = interfaces.length - 1
    }

    const currentInterface = interfaces[ifaceIdx]
    const newParams = parseParameters(rawParams)
    if (isInheritedInterface(currentInterface)) {
        if (functionExistsOnParentInterface(root, currentInterface, functionId, newParams)) {
            return result
        }
        throw new Error(
            `Cannot add function "${functionId}" to interface "${interfaceId}": ` +
                `this interface inherits from a parent and its functions are locked.`
        )
    }

    let iface: LocalInterfaceSpecification = {
        ...currentInterface,
        functions: [...currentInterface.functions],
    }
    const exactMatchIdx = iface.functions.findIndex(
        (f) => f.id === functionId && paramsMatch(f.parameters, newParams)
    )

    if (exactMatchIdx === -1) {
        const sameIdSameCount = iface.functions.find(
            (f) => f.id === functionId && f.parameters.length === newParams.length
        )
        if (sameIdSameCount) {
            throw new Error(
                `Parameter mismatch for function "${functionId}" in interface "${interfaceId}": ` +
                    `existing (${paramsToString(sameIdSameCount.parameters)}) vs new (${paramsToString(newParams)})`
            )
        }
        iface = {
            ...iface,
            functions: [...iface.functions, createInterfaceFunction(functionId, newParams)],
        }
    }

    interfaces[ifaceIdx] = iface
    result[ownerIdx] = normalizeComponent({ ...targetComp, interfaces })
    return result
}
