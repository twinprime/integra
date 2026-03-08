import type { ComponentNode, Parameter } from "../store/types"

export const updateFunctionParams = (
  comp: ComponentNode,
  functionUuid: string,
  newParams: Parameter[],
): ComponentNode => ({
  ...comp,
  interfaces: comp.interfaces.map((iface) => ({
    ...iface,
    functions: iface.functions.map((f) =>
      f.uuid === functionUuid ? { ...f, parameters: newParams } : f,
    ),
  })),
  subComponents: comp.subComponents.map((sub) =>
    updateFunctionParams(sub, functionUuid, newParams),
  ),
})

export const addFunctionToInterface = (
  comp: ComponentNode,
  existingFunctionUuid: string,
  functionId: string,
  newParams: Parameter[],
): ComponentNode => {
  const ifaceIdx =
    comp.interfaces?.findIndex((i) =>
      i.functions.some((f) => f.uuid === existingFunctionUuid),
    ) ?? -1
  if (ifaceIdx >= 0) {
    return {
      ...comp,
      interfaces: comp.interfaces.map((iface, idx) =>
        idx === ifaceIdx
          ? {
              ...iface,
              functions: [
                ...iface.functions,
                { uuid: crypto.randomUUID(), id: functionId, parameters: newParams },
              ],
            }
          : iface,
      ),
    }
  }
  return {
    ...comp,
    subComponents: comp.subComponents.map((sub) =>
      addFunctionToInterface(sub, existingFunctionUuid, functionId, newParams),
    ),
  }
}

export const removeFunctionsFromInterfaces = (
  comp: ComponentNode,
  uuidsToRemove: Set<string>,
): ComponentNode => {
  if (uuidsToRemove.size === 0) return comp
  return {
    ...comp,
    interfaces: comp.interfaces.map((iface) => ({
      ...iface,
      functions: iface.functions.filter((f) => !uuidsToRemove.has(f.uuid)),
    })),
    subComponents: comp.subComponents.map((sub) =>
      removeFunctionsFromInterfaces(sub, uuidsToRemove),
    ),
  }
}

export const removeInterfaceFromComponent = (
  comp: ComponentNode,
  interfaceIndex: number,
): ComponentNode => ({
  ...comp,
  interfaces: comp.interfaces.filter((_, i) => i !== interfaceIndex),
})
