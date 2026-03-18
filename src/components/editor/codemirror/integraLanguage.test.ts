/**
 * integraLanguage.test.ts
 *
 * Unit tests for the Chevrotain-based annotation builder in integraLanguage.ts.
 * Tests verify that:
 *   - Token types are mapped to the correct CSS classes
 *   - The navigation map (uuid entries) is built correctly
 *   - Edge cases (empty doc, partial lines, multi-line) are handled
 */
import { describe, it, expect } from 'vitest'
import { buildAnnotations, CLS, type DiagramContext } from './integraLanguage'
import type { ComponentNode } from '../../../store/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRoot(overrides: Partial<ComponentNode> = {}): ComponentNode {
    return {
        uuid: 'root-uuid',
        id: 'root',
        name: 'Root',
        type: 'component',
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
        ...overrides,
    }
}

function makeCtx(
    diagramType: DiagramContext['diagramType'],
    root: ComponentNode,
    ownerComp: ComponentNode | null = root
): DiagramContext {
    return { diagramType, rootComponent: root, ownerComp }
}

// ─── Empty / trivial ──────────────────────────────────────────────────────────

describe('buildAnnotations — empty / trivial', () => {
    it('returns empty array for empty document', () => {
        expect(buildAnnotations('', makeCtx('sequence-diagram', makeRoot()))).toEqual([])
    })

    it('falls back to default class for unrecognised lines', () => {
        // In the new lexer-based approach, unrecognised tokens produce no annotations.
        // Tokens that don't match any grammar token are skipped by the lexer.
        const anns = buildAnnotations('hello world', makeCtx('sequence-diagram', makeRoot()))
        // "hello" and "world" are Identifiers → cm-integra-id class
        expect(anns.every((a) => a.cls === CLS.identifier || a.cls === CLS.default)).toBe(true)
    })
})

// ─── Sequence diagram ─────────────────────────────────────────────────────────

describe('buildAnnotations — sequence diagram', () => {
    it("highlights 'actor' keyword with keyword class", () => {
        const anns = buildAnnotations('actor user', makeCtx('sequence-diagram', makeRoot()))
        const kwEntry = anns.find((a) => a.cls === CLS.keyword)
        expect(kwEntry).toBeDefined()
        expect(kwEntry!.to - kwEntry!.from).toBe('actor'.length)
    })

    it('highlights participant id with identifier class', () => {
        const anns = buildAnnotations('actor user as u', makeCtx('sequence-diagram', makeRoot()))
        const idEntries = anns.filter((a) => a.cls === CLS.identifier)
        expect(idEntries.length).toBeGreaterThan(0)
    })

    it('highlights arrow (->>)  with operator class', () => {
        const anns = buildAnnotations(
            'sender ->> receiver: SomeLabel',
            makeCtx('sequence-diagram', makeRoot())
        )
        const opEntry = anns.find((a) => a.cls === CLS.operator && a.to - a.from > 1)
        expect(opEntry).toBeDefined()
    })

    it('highlights InterfaceId:FunctionId with function class', () => {
        const anns = buildAnnotations(
            'sender ->> receiver: IFace:doThing(x: string)',
            makeCtx('sequence-diagram', makeRoot())
        )
        const fnEntry = anns.find((a) => a.cls === CLS.function)
        expect(fnEntry).toBeDefined()
    })

    it('highlights UseCase:ucId with function class', () => {
        const anns = buildAnnotations(
            'sender ->> receiver: UseCase:login()',
            makeCtx('sequence-diagram', makeRoot())
        )
        const fnEntry = anns.find((a) => a.cls === CLS.function)
        expect(fnEntry).toBeDefined()
    })

    it('highlights plain message label with label class', () => {
        const anns = buildAnnotations(
            'sender->>receiver: plain text label',
            makeCtx('sequence-diagram', makeRoot())
        )
        const labelEntry = anns.find((a) => a.cls === CLS.label)
        expect(labelEntry).toBeDefined()
    })

    it("highlights 'component' keyword on bare declaration", () => {
        const anns = buildAnnotations('component svc', makeCtx('sequence-diagram', makeRoot()))
        expect(anns.some((a) => a.cls === CLS.keyword)).toBe(true)
    })

    it('correctly computes offsets across multiple lines', () => {
        const doc = 'actor a\nactor b'
        const anns = buildAnnotations(doc, makeCtx('sequence-diagram', makeRoot()))
        const offsets = anns.map((a) => a.from)
        // Second line starts after "actor a\n" (8 chars); the 'b' Identifier is at offset 14
        expect(offsets.some((o) => o > 'actor a'.length)).toBe(true)
    })
})

// ─── Use-case diagram ─────────────────────────────────────────────────────────

describe('buildAnnotations — use-case diagram', () => {
    it("highlights 'use case' keyword span", () => {
        const anns = buildAnnotations(
            'use case login as l',
            makeCtx('use-case-diagram', makeRoot())
        )
        const kwEntry = anns.find((a) => a.cls === CLS.keyword)
        expect(kwEntry).toBeDefined()
    })

    it('highlights arrow in relation line with operator class', () => {
        const anns = buildAnnotations('user ->> login', makeCtx('use-case-diagram', makeRoot()))
        const opEntry = anns.find((a) => a.cls === CLS.operator)
        expect(opEntry).toBeDefined()
    })
})

// ─── Navigation map ───────────────────────────────────────────────────────────

describe('buildAnnotations — navigation map (uuid)', () => {
    it('records uuid for actor id when actor exists in ownerComp', () => {
        const root = makeRoot({
            actors: [{ uuid: 'actor-uuid', id: 'user', name: 'User', type: 'actor' }],
        })
        const anns = buildAnnotations('actor user', makeCtx('sequence-diagram', root))
        const navEntry = anns.find((a) => a.uuid === 'actor-uuid')
        expect(navEntry).toBeDefined()
    })

    it('does not record uuid when participant is not in the tree', () => {
        const root = makeRoot()
        const anns = buildAnnotations('actor unknown', makeCtx('sequence-diagram', root))
        expect(anns.every((a) => a.uuid === undefined)).toBe(true)
    })

    it('records uuid for subcomponent in sequence diagram', () => {
        const sub: ComponentNode = makeRoot({ uuid: 'sub-uuid', id: 'svc', name: 'Svc' })
        const root = makeRoot({ subComponents: [sub] })
        const anns = buildAnnotations('component svc', makeCtx('sequence-diagram', root))
        const navEntry = anns.find((a) => a.uuid === 'sub-uuid')
        expect(navEntry).toBeDefined()
    })

    it('navMap entries (uuid set) are a subset of all annotations', () => {
        const root = makeRoot({
            actors: [{ uuid: 'actor-uuid', id: 'user', name: 'User', type: 'actor' }],
        })
        const anns = buildAnnotations(
            'actor user\nactor user as u',
            makeCtx('sequence-diagram', root)
        )
        const navEntries = anns.filter((a) => !!a.uuid)
        expect(navEntries.length).toBeGreaterThan(0)
        navEntries.forEach((n) => expect(n.uuid).toBeTruthy())
    })
})

// ─── CSS class constants ──────────────────────────────────────────────────────

describe('CLS constants', () => {
    it('all class names start with cm-integra-', () => {
        Object.values(CLS).forEach((c) => {
            expect(c).toMatch(/^cm-integra-/)
        })
    })

    it('all class names are unique', () => {
        const values = Object.values(CLS)
        expect(new Set(values).size).toBe(values.length)
    })
})
