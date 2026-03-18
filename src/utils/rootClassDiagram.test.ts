// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildRootClassDiagram } from './rootClassDiagram'
import type {
    ComponentNode,
    SequenceDiagramNode,
    UseCaseNode,
    UseCaseDiagramNode,
} from '../store/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeSeqDiagram = (content: string, ownerUuid = 'root-uuid'): SequenceDiagramNode => ({
    uuid: 'seq-uuid',
    id: 'seq',
    name: 'Seq',
    type: 'sequence-diagram',
    content,
    description: '',
    ownerComponentUuid: ownerUuid,
    referencedNodeIds: [],
    referencedFunctionUuids: [],
})

const makeUseCase = (...diagrams: SequenceDiagramNode[]): UseCaseNode => ({
    uuid: 'uc-uuid',
    id: 'uc',
    name: 'Use Case',
    type: 'use-case',
    sequenceDiagrams: diagrams,
})

const makeUcd = (ownerUuid: string, ...useCases: UseCaseNode[]): UseCaseDiagramNode => ({
    uuid: 'ucd-uuid',
    id: 'ucd',
    name: 'UCD',
    type: 'use-case-diagram',
    content: '',
    description: '',
    ownerComponentUuid: ownerUuid,
    referencedNodeIds: [],
    useCases,
})

/**
 * Root tree:
 *   root (uuid: root-uuid)
 *   ├── compA (uuid: compa-uuid)  interfaces: [IFoo{doSomething, getAll}]
 *   └── compB (uuid: compb-uuid)  interfaces: [IBaz{process}]
 */
const makeRoot = (extraSeqDiagrams: SequenceDiagramNode[] = []): ComponentNode => ({
    uuid: 'root-uuid',
    id: 'root',
    name: 'Root',
    type: 'component',
    actors: [],
    subComponents: [
        {
            uuid: 'compa-uuid',
            id: 'compA',
            name: 'Component A',
            type: 'component',
            subComponents: [],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [
                {
                    uuid: 'ifoo-uuid',
                    id: 'IFoo',
                    name: 'IFoo',
                    type: 'rest',
                    functions: [
                        {
                            uuid: 'fn1-uuid',
                            id: 'doSomething',
                            parameters: [{ name: 'id', type: 'string', required: true }],
                        },
                        {
                            uuid: 'fn2-uuid',
                            id: 'getAll',
                            parameters: [{ name: 'page', type: 'number', required: false }],
                        },
                    ],
                },
            ],
        },
        {
            uuid: 'compb-uuid',
            id: 'compB',
            name: 'Component B',
            type: 'component',
            subComponents: [],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [
                {
                    uuid: 'ibaz-uuid',
                    id: 'IBaz',
                    name: 'IBaz',
                    type: 'rest',
                    functions: [
                        {
                            uuid: 'fn3-uuid',
                            id: 'process',
                            parameters: [{ name: 'data', type: 'string', required: true }],
                        },
                    ],
                },
            ],
        },
    ],
    useCaseDiagrams: extraSeqDiagrams.length
        ? [makeUcd('root-uuid', makeUseCase(...extraSeqDiagrams))]
        : [],
    interfaces: [],
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildRootClassDiagram', () => {
    it('returns empty when root has no sub-components', () => {
        const root: ComponentNode = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'Root',
            type: 'component',
            subComponents: [],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [],
        }
        const result = buildRootClassDiagram(root)
        expect(result.mermaidContent).toBe('')
        expect(result.idToUuid).toEqual({})
    })

    it('shows all direct child components as class nodes', () => {
        const root = makeRoot()
        const result = buildRootClassDiagram(root)
        expect(result.mermaidContent).toContain('class compA["Component A"]')
        expect(result.mermaidContent).toContain('class compB["Component B"]')
    })

    it('includes idToUuid entries for all children', () => {
        const root = makeRoot()
        const result = buildRootClassDiagram(root)
        expect(result.idToUuid['compA']).toBe('compa-uuid')
        expect(result.idToUuid['compB']).toBe('compb-uuid')
    })

    it('includes click handlers for all children', () => {
        const root = makeRoot()
        const result = buildRootClassDiagram(root)
        expect(result.mermaidContent).toContain('click compA call __integraNavigate("compA")')
        expect(result.mermaidContent).toContain('click compB call __integraNavigate("compB")')
    })

    it('includes root actors that participate in reachable diagrams', () => {
        const sd = makeSeqDiagram(
            'actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething(id: string)'
        )
        const root: ComponentNode = {
            ...makeRoot([sd]),
            actors: [
                { uuid: 'user-uuid', id: 'user', name: 'User', type: 'actor', description: '' },
            ],
        }
        const result = buildRootClassDiagram(root)

        expect(result.mermaidContent).toContain('class user["User"]:::actor {')
        expect(result.mermaidContent).toContain('<<actor>>')
        expect(result.mermaidContent).toContain('user ..> IFoo')
        expect(result.mermaidContent).toContain('click user call __integraNavigate("user")')
        expect(result.idToUuid.user).toBe('user-uuid')
    })

    it('rolls nested descendant dependencies up to direct root children', () => {
        const sd = makeSeqDiagram(
            [
                'component parent/compA as compA',
                'component platform',
                'compA ->> platform: IPlatform:handlePlatform(data: string)',
            ].join('\n')
        )
        const root: ComponentNode = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'Root',
            type: 'component',
            actors: [],
            subComponents: [
                {
                    uuid: 'parent-uuid',
                    id: 'parent',
                    name: 'Parent',
                    type: 'component',
                    actors: [],
                    subComponents: [
                        {
                            uuid: 'nested-compa-uuid',
                            id: 'compA',
                            name: 'Component A',
                            type: 'component',
                            subComponents: [],
                            actors: [],
                            useCaseDiagrams: [],
                            interfaces: [],
                        },
                    ],
                    useCaseDiagrams: [],
                    interfaces: [],
                },
                {
                    uuid: 'platform-uuid',
                    id: 'platform',
                    name: 'Platform',
                    type: 'component',
                    actors: [],
                    subComponents: [],
                    useCaseDiagrams: [],
                    interfaces: [
                        {
                            uuid: 'platform-iface-uuid',
                            id: 'IPlatform',
                            name: 'IPlatform',
                            type: 'rest',
                            functions: [
                                {
                                    uuid: 'platform-fn-uuid',
                                    id: 'handlePlatform',
                                    parameters: [{ name: 'data', type: 'string', required: true }],
                                },
                            ],
                        },
                    ],
                },
            ],
            useCaseDiagrams: [makeUcd('root-uuid', makeUseCase(sd))],
            interfaces: [],
        }

        const result = buildRootClassDiagram(root)
        expect(result.mermaidContent).toContain('platform ..|> IPlatform')
        expect(result.mermaidContent).toContain('parent ..> IPlatform')
        expect(result.idToUuid.parent).toBe('parent-uuid')
        expect(result.idToUuid.compA).toBeUndefined()
    })

    it('shows all functions when no messages reference the interface', () => {
        const root = makeRoot()
        const result = buildRootClassDiagram(root)
        // No messages — should fall back to showing all functions
        expect(result.mermaidContent).toContain('+doSomething(id: string)')
        expect(result.mermaidContent).toContain('+getAll(page: number?)')
        expect(result.mermaidContent).toContain('+process(data: string)')
    })

    it('shows realization arrows from component to its interfaces', () => {
        const root = makeRoot()
        const result = buildRootClassDiagram(root)
        expect(result.mermaidContent).toContain('compA ..|> IFoo')
        expect(result.mermaidContent).toContain('compB ..|> IBaz')
    })

    it('filters interface functions to only those called in a message (partial call)', () => {
        // IFoo has doSomething and getAll; only doSomething is called
        const sd = makeSeqDiagram(
            'component compB\ncomponent compA\ncompB ->> compA: IFoo:doSomething(id: string)'
        )
        const root = makeRoot([sd])
        const result = buildRootClassDiagram(root)
        // doSomething was called → shown
        expect(result.mermaidContent).toContain('+doSomething(id: string)')
        // getAll was NOT called → filtered out
        expect(result.mermaidContent).not.toContain('+getAll(page: number?)')
        // IBaz was never referenced → show all its functions (undefined → show all)
        expect(result.mermaidContent).toContain('+process(data: string)')
    })

    it('shows dependency arrow between children via interface', () => {
        const sd = makeSeqDiagram(
            'component compA\ncomponent compB\ncompA ->> compB: IBaz:process(data: string)'
        )
        const root = makeRoot([sd])
        const result = buildRootClassDiagram(root)
        expect(result.mermaidContent).toContain('compA ..> IBaz')
    })

    it('records sequence-diagram provenance for dependency arrows', () => {
        const sd = makeSeqDiagram(
            'component compA\ncomponent compB\ncompA ->> compB: IBaz:process(data: string)'
        )
        const root = makeRoot([sd])
        const result = buildRootClassDiagram(root)

        expect(result.relationshipMetadata).toContainEqual({
            sequenceDiagrams: [{ uuid: 'seq-uuid', name: 'Seq' }],
        })
    })

    it('does not show dependency arrow for self-calls', () => {
        const sd = makeSeqDiagram(
            'component compA\ncomponent compA\ncompA ->> compA: IFoo:doSomething(id: string)'
        )
        const root = makeRoot([sd])
        const result = buildRootClassDiagram(root)
        expect(result.mermaidContent).not.toContain('compA ..> compA')
        expect(result.mermaidContent).not.toContain('compA ..> IFoo')
    })

    it('generates classDiagram header', () => {
        const root = makeRoot()
        const result = buildRootClassDiagram(root)
        expect(result.mermaidContent).toMatch(/^classDiagram/)
    })

    it('includes interface name (not just id) as class label', () => {
        const root: ComponentNode = {
            ...makeRoot(),
            subComponents: [
                {
                    ...makeRoot().subComponents[0],
                    interfaces: [
                        {
                            uuid: 'ifoo-uuid',
                            id: 'IFoo',
                            name: 'Foo Interface',
                            type: 'rest',
                            functions: [],
                        },
                    ],
                },
                makeRoot().subComponents[1],
            ],
        }
        const result = buildRootClassDiagram(root)
        expect(result.mermaidContent).toContain('class IFoo["Foo Interface"] {')
    })

    it('shows parent functions for an inherited child interface', () => {
        const inheritedIface = {
            uuid: 'child-ifoo-uuid',
            id: 'IFoo',
            name: 'IFoo',
            type: 'rest' as const,
            functions: [],
            parentInterfaceUuid: 'root-ifoo-uuid',
        }
        const root: ComponentNode = {
            ...makeRoot(),
            interfaces: [
                {
                    uuid: 'root-ifoo-uuid',
                    id: 'IFoo',
                    name: 'IFoo',
                    type: 'rest',
                    functions: [
                        {
                            uuid: 'root-fn1-uuid',
                            id: 'doSomething',
                            parameters: [{ name: 'id', type: 'string', required: true }],
                        },
                        {
                            uuid: 'root-fn2-uuid',
                            id: 'getAll',
                            parameters: [{ name: 'page', type: 'number', required: false }],
                        },
                    ],
                },
            ],
            subComponents: [
                {
                    ...makeRoot().subComponents[0],
                    interfaces: [inheritedIface],
                },
                makeRoot().subComponents[1],
            ],
        }

        const result = buildRootClassDiagram(root)
        expect(result.mermaidContent).toContain('+doSomething(id: string)')
        expect(result.mermaidContent).toContain('+getAll(page: number?)')
    })

    it('filters inherited child interface functions after resolving them from the parent', () => {
        const inheritedIface = {
            uuid: 'child-ifoo-uuid',
            id: 'IFoo',
            name: 'IFoo',
            type: 'rest' as const,
            functions: [],
            parentInterfaceUuid: 'root-ifoo-uuid',
        }
        const sd = makeSeqDiagram(
            'component compB\ncomponent compA\ncompB ->> compA: IFoo:doSomething(id: string)'
        )
        const root: ComponentNode = {
            ...makeRoot([sd]),
            interfaces: [
                {
                    uuid: 'root-ifoo-uuid',
                    id: 'IFoo',
                    name: 'IFoo',
                    type: 'rest',
                    functions: [
                        {
                            uuid: 'root-fn1-uuid',
                            id: 'doSomething',
                            parameters: [{ name: 'id', type: 'string', required: true }],
                        },
                        {
                            uuid: 'root-fn2-uuid',
                            id: 'getAll',
                            parameters: [{ name: 'page', type: 'number', required: false }],
                        },
                    ],
                },
            ],
            subComponents: [
                {
                    ...makeRoot().subComponents[0],
                    interfaces: [inheritedIface],
                },
                makeRoot().subComponents[1],
            ],
        }

        const result = buildRootClassDiagram(root)
        expect(result.mermaidContent).toContain('+doSomething(id: string)')
        expect(result.mermaidContent).not.toContain('+getAll(page: number?)')
    })

    it('includes inter-child dependencies from referenced sequence diagrams', () => {
        const entrySeq = {
            ...makeSeqDiagram(
                ['component compA', 'component compB', 'compA ->> compB: Sequence:sharedFlow'].join(
                    '\n'
                )
            ),
            id: 'entry',
            uuid: 'entry-seq-uuid',
            name: 'Entry Seq',
        }
        const sharedSeq = {
            ...makeSeqDiagram(
                [
                    'component compA',
                    'component compB',
                    'compA ->> compB: IBaz:process(data: string)',
                ].join('\n')
            ),
            id: 'sharedFlow',
            uuid: 'shared-seq-uuid',
            name: 'Shared Flow',
        }

        const result = buildRootClassDiagram(makeRoot([entrySeq, sharedSeq]))

        expect(result.mermaidContent).toContain('compA ..> IBaz')
        expect(result.relationshipMetadata).toContainEqual({
            sequenceDiagrams: [{ uuid: 'shared-seq-uuid', name: 'Shared Flow' }],
        })
    })
})
