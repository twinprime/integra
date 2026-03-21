import { describe, expect, it } from 'vitest'
import { parseComponentNode, safeParsePersistedSystemState } from './modelSchema'
import { isInheritedInterface, isLocalInterface } from '../utils/interfaceFunctions'

describe('modelSchema', () => {
    it('migrates legacy local interfaces to explicit local variants', () => {
        const component = parseComponentNode({
            uuid: 'root-uuid',
            id: 'root',
            name: 'Root',
            type: 'component',
            subComponents: [],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [
                {
                    uuid: 'iface-uuid',
                    id: 'API',
                    name: 'API',
                    type: 'rest',
                    functions: [
                        {
                            uuid: 'fn-uuid',
                            id: 'list',
                            parameters: [],
                        },
                    ],
                },
            ],
        })

        const iface = component.interfaces[0]
        expect(isLocalInterface(iface)).toBe(true)
        expect(iface.kind).toBe('local')
        expect(iface.functions).toHaveLength(1)
    })

    it('migrates legacy inherited interfaces and preserves parent linkage', () => {
        const component = parseComponentNode({
            uuid: 'root-uuid',
            id: 'root',
            name: 'Root',
            type: 'component',
            subComponents: [],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [
                {
                    uuid: 'child-iface-uuid',
                    id: 'API',
                    name: 'API',
                    type: 'rest',
                    parentInterfaceUuid: 'parent-iface-uuid',
                    functions: [],
                },
            ],
        })

        const iface = component.interfaces[0]
        expect(isInheritedInterface(iface)).toBe(true)
        expect(iface.kind).toBe('inherited')
        expect(iface.parentInterfaceUuid).toBe('parent-iface-uuid')
        expect(iface.functions).toEqual([])
    })

    it('validates persisted state and fills diagram defaults', () => {
        const result = safeParsePersistedSystemState({
            rootComponent: {
                uuid: 'root-uuid',
                id: 'root',
                name: 'Root',
                type: 'component',
                interfaces: [],
                actors: [],
                subComponents: [],
                useCaseDiagrams: [
                    {
                        uuid: 'ucd-uuid',
                        id: 'diag',
                        name: 'Diag',
                        type: 'use-case-diagram',
                        content: '',
                        useCases: [
                            {
                                uuid: 'uc-uuid',
                                id: 'uc',
                                name: 'Use case',
                                type: 'use-case',
                                sequenceDiagrams: [
                                    {
                                        uuid: 'seq-uuid',
                                        id: 'seq',
                                        name: 'Sequence',
                                        type: 'sequence-diagram',
                                        content: '',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        })

        expect(result.success).toBe(true)
        if (!result.success) return

        const seq = result.data.rootComponent.useCaseDiagrams[0].useCases[0].sequenceDiagrams[0]
        expect(seq.referencedNodeIds).toEqual([])
        expect(seq.referencedFunctionUuids).toEqual([])
        expect(seq.ownerComponentUuid).toBe('')
    })

    it('accepts an optional persisted saved snapshot', () => {
        const result = safeParsePersistedSystemState({
            rootComponent: {
                uuid: 'root-uuid',
                id: 'root',
                name: 'Root',
                type: 'component',
                interfaces: [],
                actors: [],
                subComponents: [],
                useCaseDiagrams: [],
            },
            savedSnapshot: 'root: saved',
        })

        expect(result.success).toBe(true)
        if (!result.success) return

        expect(result.data.savedSnapshot).toBe('root: saved')
    })

    it('accepts an optional persisted uiMode', () => {
        const result = safeParsePersistedSystemState({
            rootComponent: {
                uuid: 'root-uuid',
                id: 'root',
                name: 'Root',
                type: 'component',
                interfaces: [],
                actors: [],
                subComponents: [],
                useCaseDiagrams: [],
            },
            uiMode: 'edit',
        })

        expect(result.success).toBe(true)
        if (!result.success) return

        expect(result.data.uiMode).toBe('edit')
    })
})
