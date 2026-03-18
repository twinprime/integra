import { describe, it, expect } from 'vitest'
import {
    getUseCaseChildren,
    deleteFromUseCase,
    upsertInUseCase,
    applyIdRenameInUseCase,
    getSiblingIdsInUseCase,
    getChildById,
    findParentInUseCase,
    useCaseHandler,
} from './useCaseNode'
import type { UseCaseNode, SequenceDiagramNode } from '../store/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSeqDiag(uuid: string, id: string): SequenceDiagramNode {
    return {
        uuid,
        id,
        name: id,
        type: 'sequence-diagram',
        content: '',
        referencedNodeIds: [],
        ownerComponentUuid: 'root',
        referencedFunctionUuids: [],
    }
}

function makeUseCase(overrides: Partial<UseCaseNode> = {}): UseCaseNode {
    return {
        uuid: 'uc1',
        id: 'placeOrder',
        name: 'Place Order',
        type: 'use-case',
        sequenceDiagrams: [makeSeqDiag('sd1', 'mainFlow'), makeSeqDiag('sd2', 'altFlow')],
        ...overrides,
    }
}

// ─── getUseCaseChildren ───────────────────────────────────────────────────────

describe('getUseCaseChildren', () => {
    it('returns the sequenceDiagrams array', () => {
        const uc = makeUseCase()
        expect(getUseCaseChildren(uc)).toEqual(uc.sequenceDiagrams)
    })

    it('returns empty array when there are no sequence diagrams', () => {
        const uc = makeUseCase({ sequenceDiagrams: [] })
        expect(getUseCaseChildren(uc)).toHaveLength(0)
    })
})

// ─── deleteFromUseCase ────────────────────────────────────────────────────────

describe('deleteFromUseCase', () => {
    it('removes a sequence diagram by UUID', () => {
        const uc = makeUseCase()
        const result = deleteFromUseCase(uc, 'sd1')
        expect(result.sequenceDiagrams).toHaveLength(1)
        expect(result.sequenceDiagrams[0].uuid).toBe('sd2')
    })

    it('does not remove when UUID does not match', () => {
        const uc = makeUseCase()
        const result = deleteFromUseCase(uc, 'nonexistent')
        expect(result.sequenceDiagrams).toHaveLength(2)
    })

    it('returns a new object (immutable)', () => {
        const uc = makeUseCase()
        const result = deleteFromUseCase(uc, 'sd1')
        expect(result).not.toBe(uc)
    })
})

// ─── upsertInUseCase ──────────────────────────────────────────────────────────

describe('upsertInUseCase', () => {
    it('applies updater to a matching sequence diagram', () => {
        const uc = makeUseCase()
        const result = upsertInUseCase(uc, 'sd1', (n) => ({ ...n, name: 'updated' }))
        expect(result.sequenceDiagrams[0].name).toBe('updated')
        expect(result.sequenceDiagrams[1].name).toBe('altFlow') // unchanged
    })

    it('does not call updater when UUID does not match any diagram', () => {
        let called = false
        const uc = makeUseCase()
        upsertInUseCase(uc, 'nonexistent', (n) => {
            called = true
            return n
        })
        expect(called).toBe(false)
    })

    it('returns a new object (immutable)', () => {
        const uc = makeUseCase()
        const result = upsertInUseCase(uc, 'sd1', (n) => n)
        expect(result).not.toBe(uc)
    })
})

// ─── applyIdRenameInUseCase ───────────────────────────────────────────────────

describe('applyIdRenameInUseCase', () => {
    it('renames the use case id when its UUID matches the target', () => {
        const uc = makeUseCase()
        const result = applyIdRenameInUseCase(uc, 'uc1', 'placeOrder', 'submitOrder')
        expect(result.id).toBe('submitOrder')
    })

    it('does not rename the use case id when UUID does not match', () => {
        const uc = makeUseCase()
        const result = applyIdRenameInUseCase(uc, 'other-uuid', 'placeOrder', 'submitOrder')
        expect(result.id).toBe('placeOrder')
    })

    it('updates description references when oldId appears as a markdown link path segment', () => {
        const uc = makeUseCase({ description: 'See [order](placeOrder) flow' })
        const result = applyIdRenameInUseCase(uc, 'other-uuid', 'placeOrder', 'submitOrder')
        expect(result.description).toContain('(submitOrder)')
    })

    it('leaves description undefined when not set', () => {
        const uc = makeUseCase()
        const result = applyIdRenameInUseCase(uc, 'uc1', 'placeOrder', 'submitOrder')
        expect(result.description).toBeUndefined()
    })

    it('propagates rename into sequence diagrams', () => {
        const uc = makeUseCase()
        const result = applyIdRenameInUseCase(uc, 'sd1', 'mainFlow', 'happyPath')
        expect(result.sequenceDiagrams[0].id).toBe('happyPath')
        expect(result.sequenceDiagrams[1].id).toBe('altFlow')
    })

    it('returns a new object (immutable)', () => {
        const uc = makeUseCase()
        const result = applyIdRenameInUseCase(uc, 'uc1', 'placeOrder', 'submitOrder')
        expect(result).not.toBe(uc)
    })
})

// ─── getSiblingIdsInUseCase ───────────────────────────────────────────────────

describe('getSiblingIdsInUseCase', () => {
    it('returns sibling diagram ids for a matching sequence diagram', () => {
        const uc = makeUseCase()
        expect(getSiblingIdsInUseCase(uc, 'sd1')).toEqual(['altFlow'])
    })

    it('returns empty array when the diagram is the only one', () => {
        const uc = makeUseCase({ sequenceDiagrams: [makeSeqDiag('sd1', 'mainFlow')] })
        expect(getSiblingIdsInUseCase(uc, 'sd1')).toEqual([])
    })

    it('returns null when UUID is not found', () => {
        const uc = makeUseCase()
        expect(getSiblingIdsInUseCase(uc, 'nonexistent')).toBeNull()
    })
})

// ─── getChildById ─────────────────────────────────────────────────────────────

describe('getChildById (useCaseNode)', () => {
    it('returns the sequence diagram matching the given id', () => {
        const uc = makeUseCase()
        expect(getChildById(uc, 'mainFlow')).toEqual(uc.sequenceDiagrams[0])
    })

    it('returns null when id is not found', () => {
        const uc = makeUseCase()
        expect(getChildById(uc, 'missing')).toBeNull()
    })
})

// ─── findParentInUseCase ──────────────────────────────────────────────────────

describe('findParentInUseCase', () => {
    it('returns the use case as parent when the target is one of its sequence diagrams', () => {
        const uc = makeUseCase()
        expect(findParentInUseCase(uc, 'sd1')).toBe(uc)
    })

    it('returns null when the target UUID is not a direct child', () => {
        const uc = makeUseCase()
        expect(findParentInUseCase(uc, 'nonexistent')).toBeNull()
    })
})

// ─── useCaseHandler ───────────────────────────────────────────────────────────

describe('useCaseHandler', () => {
    it('canDelete is true', () => {
        expect(useCaseHandler.canDelete).toBe(true)
    })

    it('getChildren returns sequence diagrams', () => {
        const uc = makeUseCase()
        expect(useCaseHandler.getChildren(uc)).toEqual(uc.sequenceDiagrams)
    })

    it('deleteChild removes a sequence diagram by UUID', () => {
        const uc = makeUseCase()
        const result = useCaseHandler.deleteChild(uc, 'sd1') as UseCaseNode
        expect(result.sequenceDiagrams).toHaveLength(1)
        expect(result.sequenceDiagrams[0].uuid).toBe('sd2')
    })

    it('getChildById returns matching sequence diagram', () => {
        const uc = makeUseCase()
        expect(useCaseHandler.getChildById(uc, 'mainFlow')).toEqual(uc.sequenceDiagrams[0])
    })

    it('addChild appends a sequence diagram with ownerComponentUuid stamped', () => {
        const uc = makeUseCase({ sequenceDiagrams: [] })
        const sd = makeSeqDiag('sd-new', 'newFlow')
        const result = useCaseHandler.addChild(uc, sd, 'comp-uuid') as UseCaseNode
        expect(result.sequenceDiagrams).toHaveLength(1)
        expect(result.sequenceDiagrams[0].ownerComponentUuid).toBe('comp-uuid')
        expect(result.sequenceDiagrams[0].referencedFunctionUuids).toEqual([])
    })

    it('addChild ignores non-sequence-diagram nodes', () => {
        const uc = makeUseCase({ sequenceDiagrams: [] })
        const nonSd = {
            uuid: 'x',
            id: 'x',
            name: 'x',
            type: 'use-case' as const,
            sequenceDiagrams: [],
        }
        const result = useCaseHandler.addChild(uc, nonSd, 'comp-uuid') as UseCaseNode
        expect(result.sequenceDiagrams).toHaveLength(0)
    })

    it('addToComponent returns the component unchanged', () => {
        const comp = {
            uuid: 'c',
            id: 'c',
            name: 'c',
            type: 'component' as const,
            subComponents: [],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [],
        }
        expect(useCaseHandler.addToComponent(comp, makeUseCase(), 'c')).toBe(comp)
    })
})
