// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { resolveEffectiveInterfaceFunctions } from './interfaceFunctions'
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
})
