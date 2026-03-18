import { describe, it, expect } from 'vitest'
import { deleteFromComponent, upsertInComponent, applyIdRenameInComponent } from './componentCRUD'
import type { ComponentNode, ActorNode, UseCaseDiagramNode } from '../store/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeActor(uuid: string, id: string): ActorNode {
    return { uuid, id, name: id, type: 'actor' }
}

function makeUcd(uuid: string, id: string, ownerUuid: string): UseCaseDiagramNode {
    return {
        uuid,
        id,
        name: id,
        type: 'use-case-diagram',
        content: '',
        referencedNodeIds: [],
        ownerComponentUuid: ownerUuid,
        useCases: [],
    }
}

function makeComp(uuid: string, id: string, overrides: Partial<ComponentNode> = {}): ComponentNode {
    return {
        uuid,
        id,
        name: id,
        type: 'component',
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
        ...overrides,
    }
}

// ─── deleteFromComponent ──────────────────────────────────────────────────────

describe('deleteFromComponent', () => {
    it('removes an actor by UUID', () => {
        const comp = makeComp('root', 'root', {
            actors: [makeActor('a1', 'alice'), makeActor('a2', 'bob')],
        })
        const result = deleteFromComponent(comp, 'a1')
        expect(result.actors).toHaveLength(1)
        expect(result.actors[0].uuid).toBe('a2')
    })

    it('removes a subComponent by UUID', () => {
        const child1 = makeComp('c1', 'child1')
        const child2 = makeComp('c2', 'child2')
        const root = makeComp('root', 'root', { subComponents: [child1, child2] })
        const result = deleteFromComponent(root, 'c1')
        expect(result.subComponents).toHaveLength(1)
        expect(result.subComponents[0].uuid).toBe('c2')
    })

    it('removes a use-case-diagram by UUID', () => {
        const ucd = makeUcd('ucd1', 'MainUCD', 'root')
        const root = makeComp('root', 'root', { useCaseDiagrams: [ucd] })
        const result = deleteFromComponent(root, 'ucd1')
        expect(result.useCaseDiagrams).toHaveLength(0)
    })

    it('recurses into nested subComponents to remove a deeply nested actor', () => {
        const actor = makeActor('a1', 'alice')
        const child = makeComp('c1', 'child', { actors: [actor] })
        const root = makeComp('root', 'root', { subComponents: [child] })
        const result = deleteFromComponent(root, 'a1')
        expect(result.subComponents[0].actors).toHaveLength(0)
    })

    it('does not remove nodes with a different UUID', () => {
        const comp = makeComp('root', 'root', { actors: [makeActor('a1', 'alice')] })
        const result = deleteFromComponent(comp, 'nonexistent')
        expect(result.actors).toHaveLength(1)
    })

    it('returns a new object (immutable)', () => {
        const comp = makeComp('root', 'root', { actors: [makeActor('a1', 'alice')] })
        const result = deleteFromComponent(comp, 'a1')
        expect(result).not.toBe(comp)
    })
})

// ─── upsertInComponent ────────────────────────────────────────────────────────

describe('upsertInComponent', () => {
    it('applies updater to a matching subComponent', () => {
        const child = makeComp('c1', 'child')
        const root = makeComp('root', 'root', { subComponents: [child] })
        const result = upsertInComponent(root, 'c1', (n) => ({ ...n, name: 'updated' }))
        expect(result.subComponents[0].name).toBe('updated')
    })

    it('applies updater to a matching actor', () => {
        const actor = makeActor('a1', 'alice')
        const root = makeComp('root', 'root', { actors: [actor] })
        const result = upsertInComponent(root, 'a1', (n) => ({ ...n, name: 'Alice Updated' }))
        expect(result.actors[0].name).toBe('Alice Updated')
    })

    it('applies updater to a matching use-case-diagram', () => {
        const ucd = makeUcd('ucd1', 'MainUCD', 'root')
        const root = makeComp('root', 'root', { useCaseDiagrams: [ucd] })
        const result = upsertInComponent(root, 'ucd1', (n) => ({ ...n, name: 'Updated UCD' }))
        expect(result.useCaseDiagrams[0].name).toBe('Updated UCD')
    })

    it('recurses into nested subComponents', () => {
        const grandchild = makeComp('gc1', 'grandchild')
        const child = makeComp('c1', 'child', { subComponents: [grandchild] })
        const root = makeComp('root', 'root', { subComponents: [child] })
        const result = upsertInComponent(root, 'gc1', (n) => ({ ...n, name: 'updated-grandchild' }))
        expect(result.subComponents[0].subComponents[0].name).toBe('updated-grandchild')
    })

    it('does not call updater when no UUID matches', () => {
        let called = false
        const root = makeComp('root', 'root', { actors: [makeActor('a1', 'alice')] })
        upsertInComponent(root, 'nonexistent', (n) => {
            called = true
            return n
        })
        expect(called).toBe(false)
    })

    it('returns a new object (immutable)', () => {
        const root = makeComp('root', 'root')
        const result = upsertInComponent(root, 'nonexistent', (n) => n)
        expect(result).not.toBe(root)
    })
})

// ─── applyIdRenameInComponent ─────────────────────────────────────────────────

describe('applyIdRenameInComponent', () => {
    it("renames the component's own id when its UUID matches the target", () => {
        const comp = makeComp('root', 'oldId')
        const result = applyIdRenameInComponent(comp, 'root', 'oldId', 'newId')
        expect(result.id).toBe('newId')
    })

    it("does not rename the component's id when UUID does not match", () => {
        const comp = makeComp('root', 'oldId')
        const result = applyIdRenameInComponent(comp, 'other-uuid', 'oldId', 'newId')
        expect(result.id).toBe('oldId')
    })

    it('propagates rename into subComponents', () => {
        const child = makeComp('c1', 'childId')
        const root = makeComp('root', 'root', { subComponents: [child] })
        const result = applyIdRenameInComponent(root, 'c1', 'childId', 'renamedChild')
        expect(result.subComponents[0].id).toBe('renamedChild')
    })

    it('propagates rename into actors', () => {
        const actor = makeActor('a1', 'alice')
        const root = makeComp('root', 'root', { actors: [actor] })
        const result = applyIdRenameInComponent(root, 'a1', 'alice', 'newAlice')
        expect(result.actors[0].id).toBe('newAlice')
    })

    it('updates description references when oldId appears as a markdown link path segment', () => {
        const actor = makeActor('a1', 'alice')
        const comp: ComponentNode = {
            ...makeComp('root', 'root'),
            description: 'See [alice page](alice) for info',
            actors: [actor],
        }
        const result = applyIdRenameInComponent(comp, 'a1', 'alice', 'newAlice')
        expect(result.description).toContain('(newAlice)')
    })

    it('returns a new object (immutable)', () => {
        const comp = makeComp('root', 'root')
        const result = applyIdRenameInComponent(comp, 'root', 'root', 'newRoot')
        expect(result).not.toBe(comp)
    })
})
