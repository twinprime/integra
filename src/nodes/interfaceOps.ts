import type {
    ComponentNode,
    InterfaceFunction,
    InterfaceSpecification,
    LocalInterfaceSpecification,
    Parameter,
} from '../store/types'
import { newFunctionUuid } from '../store/types'
import { getStoredInterfaceFunctions, isLocalInterface } from '../utils/interfaceFunctions'

/**
 * Normalises a single component's interfaces and functions into canonical order:
 * - Interfaces sorted by display name (name || id), case-insensitive
 * - Functions within each interface sorted by id, case-insensitive
 *
 * All ordering logic lives here — update this function to change ordering rules.
 */
export const normalizeComponent = (comp: ComponentNode): ComponentNode => ({
    ...comp,
    interfaces: [...(comp.interfaces ?? [])]
        .sort((a: InterfaceSpecification, b: InterfaceSpecification) =>
            (a.name || a.id).localeCompare(b.name || b.id)
        )
        .map((iface) => ({
            ...iface,
            ...(isLocalInterface(iface)
                ? {
                      functions: [...iface.functions].sort(
                          (a: InterfaceFunction, b: InterfaceFunction) => a.id.localeCompare(b.id)
                      ),
                  }
                : {}),
        })),
})

/**
 * Recursively normalises all components in the tree (used when loading data).
 */
export const normalizeComponentDeep = (comp: ComponentNode): ComponentNode =>
    normalizeComponent({
        ...comp,
        subComponents: comp.subComponents.map(normalizeComponentDeep),
    })

export const updateFunctionParams = (
    comp: ComponentNode,
    functionUuid: string,
    newParams: ReadonlyArray<Parameter>
): ComponentNode => ({
    ...comp,
    interfaces: comp.interfaces.map((iface) => ({
        ...iface,
        ...(isLocalInterface(iface)
            ? {
                  functions: iface.functions.map((f) => {
                      if (f.uuid !== functionUuid) return f
                      return {
                          ...f,
                          parameters: newParams.map((p) => {
                              const existing = f.parameters.find((ep) => ep.name === p.name)
                              return existing ? { ...existing, ...p } : p
                          }),
                      }
                  }),
              }
            : {}),
    })),
    subComponents: comp.subComponents.map((sub) =>
        updateFunctionParams(sub, functionUuid, newParams)
    ),
})

export const addFunctionToInterface = (
    comp: ComponentNode,
    existingFunctionUuid: string,
    functionId: string,
    newParams: ReadonlyArray<Parameter>
): ComponentNode => {
    const ifaceIdx =
        comp.interfaces?.findIndex((i) =>
            getStoredInterfaceFunctions(i).some((f) => f.uuid === existingFunctionUuid)
        ) ?? -1
    if (ifaceIdx >= 0) {
        const localInterface = comp.interfaces[ifaceIdx]
        if (!isLocalInterface(localInterface)) return comp
        const originalFn = localInterface.functions.find((f) => f.uuid === existingFunctionUuid)
        const newFn: InterfaceFunction = {
            ...(originalFn ?? {}),
            uuid: newFunctionUuid(),
            id: functionId,
            parameters: newParams.map((p) => {
                const existing = originalFn?.parameters.find((ep) => ep.name === p.name)
                return existing ? { ...existing, ...p } : p
            }),
        }
        return normalizeComponent({
            ...comp,
            interfaces: comp.interfaces.map((iface, idx) =>
                idx === ifaceIdx
                    ? {
                          ...(iface as LocalInterfaceSpecification),
                          functions: [...localInterface.functions, newFn],
                      }
                    : iface
            ),
        })
    }
    return {
        ...comp,
        subComponents: comp.subComponents.map((sub) =>
            addFunctionToInterface(sub, existingFunctionUuid, functionId, newParams)
        ),
    }
}

export const removeFunctionsFromInterfaces = (
    comp: ComponentNode,
    uuidsToRemove: Set<string>
): ComponentNode => {
    if (uuidsToRemove.size === 0) return comp
    return {
        ...comp,
        interfaces: comp.interfaces.map((iface) =>
            isLocalInterface(iface)
                ? {
                      ...iface,
                      functions: iface.functions.filter((f) => !uuidsToRemove.has(f.uuid)),
                  }
                : iface
        ),
        subComponents: comp.subComponents.map((sub) =>
            removeFunctionsFromInterfaces(sub, uuidsToRemove)
        ),
    }
}

export const removeInterfaceFromComponent = (
    comp: ComponentNode,
    interfaceIndex: number
): ComponentNode => ({
    ...comp,
    interfaces: comp.interfaces.filter((_, i) => i !== interfaceIndex),
})
