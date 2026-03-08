import type { ComponentNode, InterfaceFunction, Parameter } from "../store/types"

export const updateFunctionParams = (
  comp: ComponentNode,
  functionUuid: string,
  newParams: Parameter[],
): ComponentNode => ({
  ...comp,
  interfaces: comp.interfaces.map((iface) => ({
    ...iface,
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
    const originalFn = comp.interfaces[ifaceIdx].functions.find(
      (f) => f.uuid === existingFunctionUuid,
    )
    const newFn: InterfaceFunction = {
      ...(originalFn ?? {}),
      uuid: crypto.randomUUID(),
      id: functionId,
      parameters: newParams.map((p) => {
        const existing = originalFn?.parameters.find((ep) => ep.name === p.name)
        return existing ? { ...existing, ...p } : p
      }),
    }
    return {
      ...comp,
      interfaces: comp.interfaces.map((iface, idx) =>
        idx === ifaceIdx
          ? { ...iface, functions: [...iface.functions, newFn] }
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
