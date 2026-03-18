import type { ComponentNode, Node } from '../store/types'
import { findParentInUcDiag } from './useCaseDiagramNode'
import { findIdInInterface } from './interfaceNode'

export const getComponentChildren = (comp: ComponentNode): Node[] => [
    ...comp.subComponents,
    ...comp.actors,
    ...comp.useCaseDiagrams,
]

export const getChildById = (comp: ComponentNode, id: string): Node | null => {
    for (const child of getComponentChildren(comp)) {
        if (child.id === id) return child
    }
    return null
}

export const findCompByUuid = (root: ComponentNode, uuid: string): ComponentNode | null => {
    if (root.uuid === uuid) return root
    for (const sub of root.subComponents) {
        const found = findCompByUuid(sub, uuid)
        if (found) return found
    }
    return null
}

export const findParentInComponent = (comp: ComponentNode, targetUuid: string): Node | null => {
    if (getComponentChildren(comp).some((c) => c.uuid === targetUuid)) return comp
    for (const sub of comp.subComponents) {
        const found = findParentInComponent(sub, targetUuid)
        if (found) return found
    }
    for (const diagram of comp.useCaseDiagrams) {
        const found = findParentInUcDiag(diagram, targetUuid)
        if (found) return found
    }
    return null
}

export const findIdInComponent = (comp: ComponentNode, uuid: string): string | null => {
    if (comp.uuid === uuid) return comp.id
    for (const a of comp.actors) if (a.uuid === uuid) return a.id
    for (const iface of comp.interfaces) {
        const found = findIdInInterface(iface, uuid)
        if (found !== null) return found
    }
    for (const ucd of comp.useCaseDiagrams) {
        if (ucd.uuid === uuid) return ucd.id
        for (const uc of ucd.useCases) {
            if (uc.uuid === uuid) return uc.id
            for (const sd of uc.sequenceDiagrams) {
                if (sd.uuid === uuid) return sd.id
            }
        }
    }
    for (const sub of comp.subComponents) {
        const found = findIdInComponent(sub, uuid)
        if (found !== null) return found
    }
    return null
}

export const getSiblingIdsInComponent = (comp: ComponentNode, uuid: string): string[] | null => {
    const checkArr = (arr: ReadonlyArray<{ uuid: string; id: string }>): string[] | null => {
        if (!arr.some((n) => n.uuid === uuid)) return null
        return arr.filter((n) => n.uuid !== uuid).map((n) => n.id)
    }
    let result = checkArr(comp.subComponents)
    if (result) return result
    result = checkArr(comp.actors)
    if (result) return result
    result = checkArr(comp.useCaseDiagrams)
    if (result) return result
    for (const ucd of comp.useCaseDiagrams) {
        result = checkArr(ucd.useCases)
        if (result) return result
        for (const uc of ucd.useCases) {
            result = checkArr(uc.sequenceDiagrams)
            if (result) return result
        }
    }
    for (const sub of comp.subComponents) {
        result = getSiblingIdsInComponent(sub, uuid)
        if (result) return result
    }
    return null
}

export const findOwnerComponentUuidInComp = (
    comp: ComponentNode,
    useCaseUuid: string
): string | null => {
    for (const ucd of comp.useCaseDiagrams) {
        if (ucd.useCases.some((uc) => uc.uuid === useCaseUuid)) return ucd.ownerComponentUuid
    }
    for (const sub of comp.subComponents) {
        const found = findOwnerComponentUuidInComp(sub, useCaseUuid)
        if (found) return found
    }
    return null
}

export const findContainerComponentByUuid = (
    comp: ComponentNode,
    uuid: string
): ComponentNode | null => {
    if (comp.uuid === uuid) return comp
    for (const sub of comp.subComponents) {
        const found = findContainerComponentByUuid(sub, uuid)
        if (found) return found
    }
    return null
}
