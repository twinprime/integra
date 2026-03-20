// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
    findConflictingInheritedChildFunctions,
    findInheritedParentFunction,
    resolveEffectiveInterfaceFunctions,
    resolveInterface,
} from './interfaceFunctions'
import type { ComponentNode } from '../store/types'

const makeComponent = (overrides: Partial<ComponentNode>): ComponentNode => ({
    uuid: 'comp-uuid',
    id: 'comp',
    name: 'Component',
    type: 'component',
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
    ...overrides,
})

describe('resolveEffectiveInterfaceFunctions', () => {
    it('returns local functions for non-inherited interfaces', () => {
        const fn = { uuid: 'fn-uuid', id: 'doWork', parameters: [] }
        const iface = {
            uuid: 'iface-uuid',
            id: 'IFace',
            name: 'IFace',
            type: 'rest' as const,
            functions: [fn],
        }
        const owner = makeComponent({ interfaces: [iface] })

        expect(resolveEffectiveInterfaceFunctions(iface, owner, owner)).toEqual([fn])
    })

    it('returns parent functions for inherited interfaces', () => {
        const parentFn = { uuid: 'parent-fn-uuid', id: 'doWork', parameters: [] }
        const parentIface = {
            uuid: 'parent-iface-uuid',
            id: 'IFace',
            name: 'IFace',
            type: 'rest' as const,
            functions: [parentFn],
        }
        const childIface = {
            uuid: 'child-iface-uuid',
            id: 'IFace',
            name: 'IFace',
            type: 'rest' as const,
            functions: [],
            parentInterfaceUuid: 'parent-iface-uuid',
        }
        const child = makeComponent({ uuid: 'child-uuid', id: 'child', interfaces: [childIface] })
        const root = makeComponent({
            uuid: 'root-uuid',
            id: 'root',
            interfaces: [parentIface],
            subComponents: [child],
        })

        expect(resolveEffectiveInterfaceFunctions(childIface, child, root)).toEqual([parentFn])
    })

    it('inherits the full effective contract from an inherited parent interface', () => {
        const rootFn = { uuid: 'root-fn-uuid', id: 'rootFn', parameters: [] }
        const parentExtraFn = { uuid: 'parent-extra-fn-uuid', id: 'parentExtra', parameters: [] }
        const rootIface = {
            uuid: 'root-iface-uuid',
            id: 'IFace',
            name: 'IFace',
            type: 'rest' as const,
            functions: [rootFn],
        }
        const parentInheritedIface = {
            uuid: 'parent-inherited-iface-uuid',
            id: 'IFace',
            name: 'IFace',
            type: 'rest' as const,
            parentInterfaceUuid: 'root-iface-uuid',
            functions: [parentExtraFn],
        }
        const childInheritedIface = {
            uuid: 'child-inherited-iface-uuid',
            id: 'IFace',
            name: 'IFace',
            type: 'rest' as const,
            parentInterfaceUuid: 'parent-inherited-iface-uuid',
            functions: [],
        }
        const grandchild = makeComponent({
            uuid: 'grandchild-uuid',
            id: 'grandchild',
            interfaces: [childInheritedIface],
        })
        const parent = makeComponent({
            uuid: 'parent-uuid',
            id: 'parent',
            interfaces: [parentInheritedIface],
            subComponents: [grandchild],
        })
        const root = makeComponent({
            uuid: 'root-uuid',
            id: 'root',
            interfaces: [rootIface],
            subComponents: [parent],
        })

        expect(resolveEffectiveInterfaceFunctions(childInheritedIface, grandchild, root)).toEqual([
            parentExtraFn,
            rootFn,
        ])
    })
})

describe('resolveInterface', () => {
    it('marks inherited-of-inherited parent functions as inherited and child functions as local', () => {
        const rootFn = { uuid: 'root-fn-uuid', id: 'rootFn', parameters: [] }
        const parentExtraFn = { uuid: 'parent-extra-fn-uuid', id: 'parentExtra', parameters: [] }
        const childExtraFn = { uuid: 'child-extra-fn-uuid', id: 'childExtra', parameters: [] }
        const rootIface = {
            uuid: 'root-iface-uuid',
            id: 'IFace',
            name: 'IFace',
            type: 'rest' as const,
            functions: [rootFn],
        }
        const parentInheritedIface = {
            uuid: 'parent-inherited-iface-uuid',
            id: 'IFace',
            name: 'IFace',
            type: 'rest' as const,
            parentInterfaceUuid: 'root-iface-uuid',
            functions: [parentExtraFn],
        }
        const childInheritedIface = {
            uuid: 'child-inherited-iface-uuid',
            id: 'IFace',
            name: 'IFace',
            type: 'rest' as const,
            parentInterfaceUuid: 'parent-inherited-iface-uuid',
            functions: [childExtraFn],
        }
        const grandchild = makeComponent({
            uuid: 'grandchild-uuid',
            id: 'grandchild',
            interfaces: [childInheritedIface],
        })
        const parent = makeComponent({
            uuid: 'parent-uuid',
            id: 'parent',
            interfaces: [parentInheritedIface],
            subComponents: [grandchild],
        })
        const root = makeComponent({
            uuid: 'root-uuid',
            id: 'root',
            interfaces: [rootIface],
            subComponents: [parent],
        })

        const resolved = resolveInterface(childInheritedIface, grandchild, root)

        expect(resolved.inheritedFunctions).toEqual([parentExtraFn, rootFn])
        expect(resolved.localFunctions).toEqual([childExtraFn])
        expect(resolved.effectiveFunctions).toEqual([childExtraFn, parentExtraFn, rootFn])
        expect(resolved.inheritedFrom?.uuid).toBe('parent-inherited-iface-uuid')
    })
})

describe('findInheritedParentFunction', () => {
    it('finds functions inherited through an inherited parent interface', () => {
        const rootFn = {
            uuid: 'root-fn-uuid',
            id: 'login',
            parameters: [{ name: 'id', type: 'string', required: true }],
        }
        const rootIface = {
            uuid: 'root-iface-uuid',
            id: 'IFace',
            name: 'IFace',
            type: 'rest' as const,
            functions: [rootFn],
        }
        const parentInheritedIface = {
            uuid: 'parent-inherited-iface-uuid',
            id: 'IFace',
            name: 'IFace',
            type: 'rest' as const,
            parentInterfaceUuid: 'root-iface-uuid',
            functions: [],
        }
        const childInheritedIface = {
            uuid: 'child-inherited-iface-uuid',
            id: 'IFace',
            name: 'IFace',
            type: 'rest' as const,
            parentInterfaceUuid: 'parent-inherited-iface-uuid',
            functions: [],
        }
        const grandchild = makeComponent({
            uuid: 'grandchild-uuid',
            id: 'grandchild',
            interfaces: [childInheritedIface],
        })
        const parent = makeComponent({
            uuid: 'parent-uuid',
            id: 'parent',
            interfaces: [parentInheritedIface],
            subComponents: [grandchild],
        })
        const root = makeComponent({
            uuid: 'root-uuid',
            id: 'root',
            interfaces: [rootIface],
            subComponents: [parent],
        })

        expect(
            findInheritedParentFunction(
                childInheritedIface,
                grandchild,
                root,
                'login',
                rootFn.parameters
            )
        ).toEqual(rootFn)
    })
})

describe('findConflictingInheritedChildFunctions', () => {
    it('finds conflicting child-local functions on transitive descendants', () => {
        const conflictParams = [{ name: 'id', type: 'string', required: true }]
        const rootIface = {
            uuid: 'root-iface-uuid',
            id: 'IFace',
            name: 'IFace',
            type: 'rest' as const,
            functions: [],
        }
        const parentInheritedIface = {
            uuid: 'parent-inherited-iface-uuid',
            id: 'IFace',
            name: 'IFace',
            type: 'rest' as const,
            parentInterfaceUuid: 'root-iface-uuid',
            functions: [],
        }
        const grandchildFn = {
            uuid: 'grandchild-fn-uuid',
            id: 'login',
            parameters: conflictParams,
        }
        const childInheritedIface = {
            uuid: 'child-inherited-iface-uuid',
            id: 'IFace',
            name: 'IFace',
            type: 'rest' as const,
            parentInterfaceUuid: 'parent-inherited-iface-uuid',
            functions: [grandchildFn],
        }
        const grandchild = makeComponent({
            uuid: 'grandchild-uuid',
            id: 'grandchild',
            name: 'Grandchild',
            interfaces: [childInheritedIface],
        })
        const parent = makeComponent({
            uuid: 'parent-uuid',
            id: 'parent',
            interfaces: [parentInheritedIface],
            subComponents: [grandchild],
        })
        const root = makeComponent({
            uuid: 'root-uuid',
            id: 'root',
            interfaces: [rootIface],
            subComponents: [parent],
        })

        expect(
            findConflictingInheritedChildFunctions(root, 'root-iface-uuid', 'login', conflictParams)
        ).toEqual([
            {
                componentUuid: 'grandchild-uuid',
                componentName: 'Grandchild',
                interfaceUuid: 'child-inherited-iface-uuid',
                interfaceId: 'IFace',
                functionUuid: 'grandchild-fn-uuid',
                functionId: 'login',
            },
        ])
    })
})
