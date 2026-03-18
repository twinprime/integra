import { describe, it, expect } from 'vitest'
import {
    getUcDiagChildren,
    deleteFromUcDiag,
    upsertInUcDiag,
    collectDiagramsFromUcDiag,
    applyIdRenameInUcDiag,
    getSiblingIdsInUcDiag,
    getChildById,
    findParentInUcDiag,
    ucDiagHandler,
} from './useCaseDiagramNode'
import type { UseCaseDiagramNode, UseCaseNode, ComponentNode } from '../store/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUseCase(uuid: string, id: string): UseCaseNode {
    return { uuid, id, name: id, type: 'use-case', sequenceDiagrams: [] }
}

function makeUcd(overrides: Partial<UseCaseDiagramNode> = {}): UseCaseDiagramNode {
    return {
        uuid: 'ucd1',
        id: 'MainUCD',
        name: 'Main UCD',
        type: 'use-case-diagram',
        content: '',
        referencedNodeIds: [],
        ownerComponentUuid: 'comp-uuid',
        useCases: [makeUseCase('uc1', 'placeOrder'), makeUseCase('uc2', 'cancelOrder')],
        ...overrides,
    }
}

function makeComp(uuid: string, id: string): ComponentNode {
    return {
        uuid,
        id,
        name: id,
        type: 'component',
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
    }
}

// ─── getUcDiagChildren ────────────────────────────────────────────────────────

describe('getUcDiagChildren', () => {
    it('returns the useCases array', () => {
        const ucd = makeUcd()
        expect(getUcDiagChildren(ucd)).toEqual(ucd.useCases)
    })

    it('returns empty array when there are no use cases', () => {
        const ucd = makeUcd({ useCases: [] })
        expect(getUcDiagChildren(ucd)).toHaveLength(0)
    })
})

// ─── deleteFromUcDiag ─────────────────────────────────────────────────────────

describe('deleteFromUcDiag', () => {
    it('removes a use case by UUID from the UCD', () => {
        const ucd = makeUcd()
        const result = deleteFromUcDiag(ucd, 'uc1')
        expect(result.useCases).toHaveLength(1)
        expect(result.useCases[0].uuid).toBe('uc2')
    })

    it('does not remove when UUID does not match any use case', () => {
        const ucd = makeUcd()
        const result = deleteFromUcDiag(ucd, 'nonexistent')
        expect(result.useCases).toHaveLength(2)
    })

    it('also removes nested sequence diagrams within a use case', () => {
        const uc = {
            ...makeUseCase('uc1', 'placeOrder'),
            sequenceDiagrams: [
                {
                    uuid: 'sd1',
                    id: 'flow',
                    name: 'flow',
                    type: 'sequence-diagram' as const,
                    content: '',
                    referencedNodeIds: [],
                    ownerComponentUuid: 'c',
                    referencedFunctionUuids: [],
                },
            ],
        }
        const ucd = makeUcd({ useCases: [uc] })
        const result = deleteFromUcDiag(ucd, 'sd1')
        expect(result.useCases[0].sequenceDiagrams).toHaveLength(0)
    })

    it('returns a new object (immutable)', () => {
        const ucd = makeUcd()
        const result = deleteFromUcDiag(ucd, 'uc1')
        expect(result).not.toBe(ucd)
    })
})

// ─── upsertInUcDiag ───────────────────────────────────────────────────────────

describe('upsertInUcDiag', () => {
    it('applies updater to a matching use case', () => {
        const ucd = makeUcd()
        const result = upsertInUcDiag(ucd, 'uc1', (n) => ({ ...n, name: 'updated' }))
        expect(result.useCases[0].name).toBe('updated')
        expect(result.useCases[1].name).toBe('cancelOrder') // unchanged
    })

    it('does not call updater when UUID does not match', () => {
        let called = false
        const ucd = makeUcd()
        upsertInUcDiag(ucd, 'nonexistent', (n) => {
            called = true
            return n
        })
        expect(called).toBe(false)
    })

    it('returns a new object (immutable)', () => {
        const ucd = makeUcd()
        const result = upsertInUcDiag(ucd, 'uc1', (n) => n)
        expect(result).not.toBe(ucd)
    })
})

// ─── collectDiagramsFromUcDiag ────────────────────────────────────────────────

describe('collectDiagramsFromUcDiag', () => {
    it('includes the UCD itself as a diagram ref', () => {
        const ucd = makeUcd({ useCases: [] })
        const refs = collectDiagramsFromUcDiag(ucd, 'owner-uuid')
        expect(refs).toHaveLength(1)
        expect(refs[0].diagram).toBe(ucd)
        expect(refs[0].ownerComponentUuid).toBe('owner-uuid')
    })

    it('includes sequence diagrams from use cases', () => {
        const sd = {
            uuid: 'sd1',
            id: 'flow',
            name: 'flow',
            type: 'sequence-diagram' as const,
            content: '',
            referencedNodeIds: [],
            ownerComponentUuid: 'c',
            referencedFunctionUuids: [],
        }
        const uc = { ...makeUseCase('uc1', 'placeOrder'), sequenceDiagrams: [sd] }
        const ucd = makeUcd({ useCases: [uc] })
        const refs = collectDiagramsFromUcDiag(ucd, 'owner-uuid')
        expect(refs).toHaveLength(2)
        expect(refs[1].diagram).toBe(sd)
        expect(refs[1].ownerComponentUuid).toBe('owner-uuid')
    })

    it('returns only the UCD when there are no use cases with diagrams', () => {
        const ucd = makeUcd()
        const refs = collectDiagramsFromUcDiag(ucd, 'owner-uuid')
        expect(refs).toHaveLength(1)
    })
})

// ─── applyIdRenameInUcDiag ────────────────────────────────────────────────────

describe('applyIdRenameInUcDiag', () => {
    it('renames the UCD id when its UUID matches the target', () => {
        const ucd = makeUcd()
        const result = applyIdRenameInUcDiag(ucd, 'ucd1', 'MainUCD', 'RenamedUCD')
        expect(result.id).toBe('RenamedUCD')
    })

    it('does not rename the UCD id when UUID does not match', () => {
        const ucd = makeUcd()
        const result = applyIdRenameInUcDiag(ucd, 'other-uuid', 'MainUCD', 'RenamedUCD')
        expect(result.id).toBe('MainUCD')
    })

    it('propagates rename into use cases', () => {
        const ucd = makeUcd()
        const result = applyIdRenameInUcDiag(ucd, 'uc1', 'placeOrder', 'submitOrder')
        expect(result.useCases[0].id).toBe('submitOrder')
        expect(result.useCases[1].id).toBe('cancelOrder')
    })

    it('updates description references when oldId appears as a markdown link path segment', () => {
        const ucd = makeUcd({ description: 'See [diagram](MainUCD) for flows' })
        const result = applyIdRenameInUcDiag(ucd, 'other-uuid', 'MainUCD', 'RenamedUCD')
        expect(result.description).toContain('(RenamedUCD)')
    })

    it('leaves description undefined when not set', () => {
        const ucd = makeUcd()
        const result = applyIdRenameInUcDiag(ucd, 'ucd1', 'MainUCD', 'RenamedUCD')
        expect(result.description).toBeUndefined()
    })

    it('returns a new object (immutable)', () => {
        const ucd = makeUcd()
        const result = applyIdRenameInUcDiag(ucd, 'ucd1', 'MainUCD', 'RenamedUCD')
        expect(result).not.toBe(ucd)
    })
})

// ─── getSiblingIdsInUcDiag ────────────────────────────────────────────────────

describe('getSiblingIdsInUcDiag', () => {
    it('returns sibling use case ids for a matching use case', () => {
        const ucd = makeUcd()
        expect(getSiblingIdsInUcDiag(ucd, 'uc1')).toEqual(['cancelOrder'])
    })

    it('returns empty array when the use case is the only one', () => {
        const ucd = makeUcd({ useCases: [makeUseCase('uc1', 'placeOrder')] })
        expect(getSiblingIdsInUcDiag(ucd, 'uc1')).toEqual([])
    })

    it('returns null when UUID is not found', () => {
        const ucd = makeUcd()
        expect(getSiblingIdsInUcDiag(ucd, 'nonexistent')).toBeNull()
    })
})

// ─── getChildById (ucDiag) ────────────────────────────────────────────────────

describe('getChildById (ucDiagNode)', () => {
    it('returns the use case matching the given id', () => {
        const ucd = makeUcd()
        expect(getChildById(ucd, 'placeOrder')).toEqual(ucd.useCases[0])
    })

    it('returns null when id is not found', () => {
        const ucd = makeUcd()
        expect(getChildById(ucd, 'missing')).toBeNull()
    })
})

// ─── findParentInUcDiag ───────────────────────────────────────────────────────

describe('findParentInUcDiag', () => {
    it('returns the UCD as parent when the target is one of its use cases', () => {
        const ucd = makeUcd()
        expect(findParentInUcDiag(ucd, 'uc1')).toBe(ucd)
    })

    it('returns a use case as parent when the target is one of its sequence diagrams', () => {
        const sd = {
            uuid: 'sd1',
            id: 'flow',
            name: 'flow',
            type: 'sequence-diagram' as const,
            content: '',
            referencedNodeIds: [],
            ownerComponentUuid: 'c',
            referencedFunctionUuids: [],
        }
        const uc = { ...makeUseCase('uc1', 'placeOrder'), sequenceDiagrams: [sd] }
        const ucd = makeUcd({ useCases: [uc] })
        expect(findParentInUcDiag(ucd, 'sd1')).toBe(uc)
    })

    it('returns null when the target UUID is not found', () => {
        const ucd = makeUcd()
        expect(findParentInUcDiag(ucd, 'nonexistent')).toBeNull()
    })
})

// ─── ucDiagHandler ────────────────────────────────────────────────────────────

describe('ucDiagHandler', () => {
    it('canDelete is true', () => {
        expect(ucDiagHandler.canDelete).toBe(true)
    })

    it('getChildren returns use cases', () => {
        const ucd = makeUcd()
        expect(ucDiagHandler.getChildren(ucd)).toEqual(ucd.useCases)
    })

    it('deleteChild removes a use case by UUID', () => {
        const ucd = makeUcd()
        const result = ucDiagHandler.deleteChild(ucd, 'uc1') as UseCaseDiagramNode
        expect(result.useCases).toHaveLength(1)
        expect(result.useCases[0].uuid).toBe('uc2')
    })

    it('getChildById returns the matching use case', () => {
        const ucd = makeUcd()
        expect(ucDiagHandler.getChildById(ucd, 'placeOrder')).toEqual(ucd.useCases[0])
    })

    it("addToComponent appends the UCD to the component's useCaseDiagrams", () => {
        const comp = makeComp('comp-uuid', 'MyComp')
        const ucd = makeUcd()
        const result = ucDiagHandler.addToComponent(comp, ucd, 'comp-uuid')
        expect(result.useCaseDiagrams).toHaveLength(1)
        expect(result.useCaseDiagrams[0].ownerComponentUuid).toBe('comp-uuid')
        expect(result.useCaseDiagrams[0].useCases).toEqual([])
    })

    it('addChild appends a use case with empty sequenceDiagrams', () => {
        const ucd = makeUcd({ useCases: [] })
        const uc = makeUseCase('uc-new', 'newAction')
        const result = ucDiagHandler.addChild(ucd, uc, 'comp-uuid') as UseCaseDiagramNode
        expect(result.useCases).toHaveLength(1)
        expect(result.useCases[0].sequenceDiagrams).toEqual([])
    })

    it('addChild ignores non-use-case nodes', () => {
        const ucd = makeUcd({ useCases: [] })
        const nonUc = makeComp('c1', 'comp')
        const result = ucDiagHandler.addChild(ucd, nonUc, 'comp-uuid') as UseCaseDiagramNode
        expect(result.useCases).toHaveLength(0)
    })
})
