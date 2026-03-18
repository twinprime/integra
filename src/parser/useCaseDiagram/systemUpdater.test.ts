/**
 * Focused unit tests for src/parser/useCaseDiagram/systemUpdater.ts
 *
 * Each test exercises the "DSL content → component tree mutation" flow
 * by calling parseUseCaseDiagram directly, inspecting the returned root.
 */
import { describe, it, expect } from 'vitest'
import { parseUseCaseDiagram } from './systemUpdater'
import type { ComponentNode, UseCaseDiagramNode } from '../../store/types'

// ─── UUIDs ────────────────────────────────────────────────────────────────────

const ROOT_UUID = 'root-uuid'
const OWNER_UUID = 'owner-uuid'
const AUTH_UUID = 'auth-uuid'
const UCD_UUID = 'ucd-uuid'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeUcdDiag(overrides: Partial<UseCaseDiagramNode> = {}): UseCaseDiagramNode {
    return {
        uuid: UCD_UUID,
        id: 'ucd',
        name: 'Use Cases',
        type: 'use-case-diagram',
        content: '',
        ownerComponentUuid: OWNER_UUID,
        referencedNodeIds: [],
        useCases: [],
        ...overrides,
    }
}

function makeOwner(overrides: Partial<ComponentNode> = {}): ComponentNode {
    return {
        uuid: OWNER_UUID,
        id: 'owner',
        name: 'Owner',
        type: 'component',
        description: '',
        subComponents: [],
        actors: [],
        interfaces: [],
        useCaseDiagrams: [makeUcdDiag()],
        ...overrides,
    }
}

function makeRoot(
    ownerOverrides: Partial<ComponentNode> = {},
    extraSubs: ComponentNode[] = []
): ComponentNode {
    return {
        uuid: ROOT_UUID,
        id: 'root',
        name: 'Root',
        type: 'component',
        description: '',
        subComponents: [makeOwner(ownerOverrides), ...extraSubs],
        actors: [],
        interfaces: [],
        useCaseDiagrams: [],
    }
}

/** Pull the updated ownerComp from the returned root. */
function getOwner(root: ComponentNode): ComponentNode {
    return root.subComponents[0]
}

/** Pull the use-case-diagram node from the returned root. */
function getUcdDiag(root: ComponentNode): UseCaseDiagramNode {
    return getOwner(root).useCaseDiagrams[0]
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parseUseCaseDiagram — actor declaration', () => {
    it('actor declaration creates an actor node under the owner component', () => {
        const root = makeRoot()
        const result = parseUseCaseDiagram('actor customer', root, OWNER_UUID, UCD_UUID)
        const actors = getOwner(result).actors
        expect(actors).toHaveLength(1)
        expect(actors[0]).toMatchObject({ id: 'customer', type: 'actor' })
    })

    it('actor with alias uses alias as name', () => {
        const root = makeRoot()
        const result = parseUseCaseDiagram('actor cust as Customer', root, OWNER_UUID, UCD_UUID)
        const actor = getOwner(result).actors[0]
        expect(actor.id).toBe('cust')
        expect(actor.name).toBe('Customer')
    })
})

describe('parseUseCaseDiagram — use-case declaration', () => {
    it('use case declaration adds a use case to the diagram', () => {
        const root = makeRoot()
        const result = parseUseCaseDiagram('use case login', root, OWNER_UUID, UCD_UUID)
        const useCases = getUcdDiag(result).useCases
        expect(useCases).toHaveLength(1)
        expect(useCases[0]).toMatchObject({ id: 'login', type: 'use-case' })
    })

    it('use case UUID appears in referencedNodeIds of the diagram', () => {
        const root = makeRoot()
        const result = parseUseCaseDiagram('use case login', root, OWNER_UUID, UCD_UUID)
        const diag = getUcdDiag(result)
        const ucUuid = diag.useCases[0].uuid
        expect(diag.referencedNodeIds).toContain(ucUuid)
    })

    it('multiple use cases are all added to the diagram', () => {
        const content = 'use case login\nuse case register\nuse case logout'
        const root = makeRoot()
        const result = parseUseCaseDiagram(content, root, OWNER_UUID, UCD_UUID)
        const ids = getUcdDiag(result).useCases.map((u) => u.id)
        expect(ids).toContain('login')
        expect(ids).toContain('register')
        expect(ids).toContain('logout')
    })
})

describe('parseUseCaseDiagram — component declaration', () => {
    it('single-segment component declaration creates a sub-component under owner', () => {
        const root = makeRoot()
        const result = parseUseCaseDiagram('component authSvc', root, OWNER_UUID, UCD_UUID)
        const subComponents = getOwner(result).subComponents
        expect(subComponents).toHaveLength(1)
        expect(subComponents[0]).toMatchObject({ id: 'authSvc', type: 'component' })
    })
})

describe('parseUseCaseDiagram — cross-component path references', () => {
    it('multi-segment path reference adds target UUID to referencedNodeIds', () => {
        const authSvc: ComponentNode = {
            uuid: AUTH_UUID,
            id: 'auth',
            name: 'Auth',
            type: 'component',
            description: '',
            subComponents: [],
            actors: [],
            interfaces: [],
            useCaseDiagrams: [],
        }
        // auth is a sibling of owner (both direct children of root)
        const root = makeRoot({}, [authSvc])
        const result = parseUseCaseDiagram('component root/auth', root, OWNER_UUID, UCD_UUID)
        expect(getUcdDiag(result).referencedNodeIds).toContain(AUTH_UUID)
    })

    it('multi-segment path reference does NOT create a new sub-component when target already exists', () => {
        const authSvc: ComponentNode = {
            uuid: AUTH_UUID,
            id: 'auth',
            name: 'Auth',
            type: 'component',
            description: '',
            subComponents: [],
            actors: [],
            interfaces: [],
            useCaseDiagrams: [],
        }
        const root = makeRoot({}, [authSvc])
        const result = parseUseCaseDiagram('component root/auth', root, OWNER_UUID, UCD_UUID)
        // root should still have exactly 2 subComponents (owner + auth)
        expect(result.subComponents).toHaveLength(2)
    })

    it('unknown path triggers auto-creation of missing component', () => {
        const root = makeRoot()
        const result = parseUseCaseDiagram('component root/newService', root, OWNER_UUID, UCD_UUID)
        const newSvc = result.subComponents.find((c) => c.id === 'newService')
        expect(newSvc).toBeDefined()
        expect(getUcdDiag(result).referencedNodeIds).toContain(newSvc!.uuid)
    })
})

describe('parseUseCaseDiagram — idempotency', () => {
    it('applying same actor declaration twice does not duplicate actors', () => {
        const content = 'actor customer'
        const root = makeRoot()
        const after1 = parseUseCaseDiagram(content, root, OWNER_UUID, UCD_UUID)
        const after2 = parseUseCaseDiagram(content, after1, OWNER_UUID, UCD_UUID)
        expect(getOwner(after2).actors.filter((a) => a.id === 'customer')).toHaveLength(1)
    })

    it('applying same use-case declaration twice does not duplicate use cases', () => {
        const content = 'use case login'
        const root = makeRoot()
        const after1 = parseUseCaseDiagram(content, root, OWNER_UUID, UCD_UUID)
        const after2 = parseUseCaseDiagram(content, after1, OWNER_UUID, UCD_UUID)
        expect(getUcdDiag(after2).useCases.filter((u) => u.id === 'login')).toHaveLength(1)
    })

    it('applying same component declaration twice does not duplicate sub-components', () => {
        const content = 'component authSvc'
        const root = makeRoot()
        const after1 = parseUseCaseDiagram(content, root, OWNER_UUID, UCD_UUID)
        const after2 = parseUseCaseDiagram(content, after1, OWNER_UUID, UCD_UUID)
        expect(getOwner(after2).subComponents.filter((c) => c.id === 'authSvc')).toHaveLength(1)
    })
})

describe('parseUseCaseDiagram — error handling', () => {
    it('throws on invalid DSL content', () => {
        const root = makeRoot()
        expect(() => parseUseCaseDiagram('>>> invalid <<<', root, OWNER_UUID, UCD_UUID)).toThrow()
    })
})
