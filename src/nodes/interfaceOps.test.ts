import { describe, it, expect } from 'vitest'
import { updateFunctionParams, normalizeComponent, normalizeComponentDeep } from './interfaceOps'
import type { ComponentNode } from '../store/types'
import { getStoredInterfaceFunctions } from '../utils/interfaceFunctions'

const FN_UUID = 'fn-uuid'

const buildComp = (): ComponentNode => ({
    uuid: 'comp-uuid',
    id: 'comp',
    name: 'Comp',
    type: 'component',
    description: '',
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [
        {
            kind: 'local',
            uuid: 'iface-uuid',
            id: 'API',
            name: 'API',
            type: 'rest',
            functions: [
                {
                    uuid: FN_UUID,
                    id: 'fn',
                    description: 'Does something useful',
                    parameters: [
                        {
                            name: 'id',
                            type: 'number',
                            required: true,
                            description: 'The entity ID',
                        },
                        {
                            name: 'name',
                            type: 'string',
                            required: true,
                            description: 'The entity name',
                        },
                    ],
                },
            ],
        },
    ],
})

// ─── updateFunctionParams ─────────────────────────────────────────────────────

describe('updateFunctionParams', () => {
    it('preserves function-level description', () => {
        const comp = buildComp()
        const result = updateFunctionParams(comp, FN_UUID, [
            { name: 'id', type: 'string', required: true },
        ])
        const fn = getStoredInterfaceFunctions(result.interfaces[0])[0]
        expect(fn.description).toBe('Does something useful')
    })

    it('preserves parameter descriptions for params whose names match', () => {
        const comp = buildComp()
        // Update type of 'id', keep 'name', add new 'extra'
        const result = updateFunctionParams(comp, FN_UUID, [
            { name: 'id', type: 'string', required: true },
            { name: 'name', type: 'string', required: false },
            { name: 'extra', type: 'boolean', required: false },
        ])
        const params = getStoredInterfaceFunctions(result.interfaces[0])[0].parameters
        expect(params[0].description).toBe('The entity ID')
        expect(params[1].description).toBe('The entity name')
        expect(params[2].description).toBeUndefined()
    })

    it('does not add a description to params with no matching name', () => {
        const comp = buildComp()
        const result = updateFunctionParams(comp, FN_UUID, [
            { name: 'newParam', type: 'string', required: true },
        ])
        const params = getStoredInterfaceFunctions(result.interfaces[0])[0].parameters
        expect(params[0].description).toBeUndefined()
    })

    it('leaves unrelated functions unchanged', () => {
        const comp = buildComp()
        const result = updateFunctionParams(comp, 'nonexistent-uuid', [
            { name: 'x', type: 'number', required: true },
        ])
        expect(result).toEqual(comp)
    })

    it('recurses into subComponents', () => {
        const root: ComponentNode = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'Root',
            type: 'component',
            description: '',
            actors: [],
            useCaseDiagrams: [],
            interfaces: [],
            subComponents: [buildComp()],
        }
        const result = updateFunctionParams(root, FN_UUID, [
            { name: 'id', type: 'string', required: true },
        ])
        const fn = getStoredInterfaceFunctions(result.subComponents[0].interfaces[0])[0]
        expect(fn.description).toBe('Does something useful')
        expect(fn.parameters[0].description).toBe('The entity ID')
    })
})

// ─── normalizeComponent ────────────────────────────────────────────────────────

describe('normalizeComponent', () => {
    it('sorts interfaces alphabetically by name', () => {
        const comp: ComponentNode = {
            uuid: 'c',
            id: 'c',
            name: 'C',
            type: 'component',
            description: '',
            subComponents: [],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [
                { kind: 'local', uuid: 'i2', id: 'IZoo', name: 'Zoo', type: 'rest', functions: [] },
                { kind: 'local', uuid: 'i1', id: 'IBar', name: 'Bar', type: 'rest', functions: [] },
                { kind: 'local', uuid: 'i3', id: 'IMid', name: 'Mid', type: 'rest', functions: [] },
            ],
        }
        const result = normalizeComponent(comp)
        expect(result.interfaces.map((i) => i.id)).toEqual(['IBar', 'IMid', 'IZoo'])
    })

    it('sorts interfaces by name even when name differs from id', () => {
        const comp: ComponentNode = {
            uuid: 'c',
            id: 'c',
            name: 'C',
            type: 'component',
            description: '',
            subComponents: [],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [
                {
                    kind: 'local',
                    uuid: 'i1',
                    id: 'IZoo',
                    name: 'Alpha API',
                    type: 'rest',
                    functions: [],
                },
                {
                    kind: 'local',
                    uuid: 'i2',
                    id: 'IBar',
                    name: 'Zebra API',
                    type: 'rest',
                    functions: [],
                },
            ],
        }
        const result = normalizeComponent(comp)
        // sorted by name: "Alpha API" < "Zebra API"
        expect(result.interfaces[0].id).toBe('IZoo')
        expect(result.interfaces[1].id).toBe('IBar')
    })

    it('sorts functions within each interface alphabetically by id', () => {
        const comp: ComponentNode = {
            uuid: 'c',
            id: 'c',
            name: 'C',
            type: 'component',
            description: '',
            subComponents: [],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [
                {
                    kind: 'local',
                    uuid: 'i1',
                    id: 'API',
                    name: 'API',
                    type: 'rest',
                    functions: [
                        { uuid: 'f3', id: 'zoo', parameters: [] },
                        { uuid: 'f1', id: 'alpha', parameters: [] },
                        { uuid: 'f2', id: 'mid', parameters: [] },
                    ],
                },
            ],
        }
        const result = normalizeComponent(comp)
        expect(getStoredInterfaceFunctions(result.interfaces[0]).map((f) => f.id)).toEqual([
            'alpha',
            'mid',
            'zoo',
        ])
    })

    it('does not mutate the input component', () => {
        const comp = buildComp()
        const original = JSON.stringify(comp)
        normalizeComponent(comp)
        expect(JSON.stringify(comp)).toBe(original)
    })
})

describe('normalizeComponentDeep', () => {
    it('sorts interfaces in nested subComponents', () => {
        const root: ComponentNode = {
            uuid: 'r',
            id: 'r',
            name: 'R',
            type: 'component',
            description: '',
            actors: [],
            useCaseDiagrams: [],
            interfaces: [],
            subComponents: [
                {
                    uuid: 'c',
                    id: 'c',
                    name: 'C',
                    type: 'component',
                    description: '',
                    subComponents: [],
                    actors: [],
                    useCaseDiagrams: [],
                    interfaces: [
                        {
                            kind: 'local',
                            uuid: 'i2',
                            id: 'IZ',
                            name: 'Z',
                            type: 'rest',
                            functions: [],
                        },
                        {
                            kind: 'local',
                            uuid: 'i1',
                            id: 'IA',
                            name: 'A',
                            type: 'rest',
                            functions: [],
                        },
                    ],
                },
            ],
        }
        const result = normalizeComponentDeep(root)
        expect(result.subComponents[0].interfaces.map((i) => i.id)).toEqual(['IA', 'IZ'])
    })
})
