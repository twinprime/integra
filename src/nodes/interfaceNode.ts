import type { InterfaceSpecification, InterfaceFunction } from '../store/types'
import { type ScopedRenameContext, updateDescriptionRefs } from '../utils/renameNodeId'
import { getStoredInterfaceFunctions, isLocalInterface } from '../utils/interfaceFunctions'

export const applyIdRenameInInterface = (
    iface: InterfaceSpecification,
    targetUuid: string,
    oldId: string,
    newId: string,
    _renameContext?: ScopedRenameContext,
    _contextComponentUuid?: string
): InterfaceSpecification => ({
    ...iface,
    id: iface.uuid === targetUuid ? newId : iface.id,
    description: iface.description
        ? updateDescriptionRefs(iface.description, oldId, newId)
        : iface.description,
    ...(isLocalInterface(iface)
        ? {
              functions: iface.functions.map((fn) =>
                  applyIdRenameInFunction(fn, targetUuid, oldId, newId)
              ),
          }
        : {}),
})

export const applyIdRenameInFunction = (
    fn: InterfaceFunction,
    targetUuid: string,
    oldId: string,
    newId: string
): InterfaceFunction => ({
    ...fn,
    id: fn.uuid === targetUuid ? newId : fn.id,
    description: fn.description
        ? updateDescriptionRefs(fn.description, oldId, newId)
        : fn.description,
})

export const findIdInInterface = (iface: InterfaceSpecification, uuid: string): string | null => {
    if (iface.uuid === uuid) return iface.id
    for (const fn of getStoredInterfaceFunctions(iface)) if (fn.uuid === uuid) return fn.id
    return null
}

export { updateContentRefs, updateDescriptionRefs } from '../utils/renameNodeId'
