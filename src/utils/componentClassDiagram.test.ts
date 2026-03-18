// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildComponentClassDiagram } from './componentClassDiagram'
import type { ComponentNode } from '../store/types'
import {
    getCompA,
    makeRoot,
    makeRootWithCompBInterfaces,
    makeRootWithGrandchild,
    makeSeqDiagram,
    makeUcd,
    makeUseCase,
} from './componentClassDiagram.test.fixtures'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildComponentClassDiagram', () => {
    it('returns empty when component has no interfaces', () => {
        const root = makeRoot()
        const compB = root.subComponents[1]
        const result = buildComponentClassDiagram(compB, root)
        expect(result.mermaidContent).toBe('')
        expect(result.idToUuid).toEqual({})
    })

    it('returns empty for empty interfaces array', () => {
        const root = makeRoot()
        const compB = { ...root.subComponents[1], interfaces: [] }
        expect(buildComponentClassDiagram(compB, root).mermaidContent).toBe('')
    })

    it('shows component and its interfaces even with no callers', () => {
        const root = makeRoot()
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).toContain('class compA["Component A"]')
        expect(result.mermaidContent).toContain('class iface_ifoo_uuid["IFoo"] {')
        expect(result.mermaidContent).toContain('<<interface>>')
        expect(result.mermaidContent).toContain('+doSomething(id: string)')
        expect(result.mermaidContent).toContain('class iface_ibar_uuid["IBar"] {')
        expect(result.mermaidContent).toContain('+getAll(page: number?)')
    })

    it('uses interface name (not id) as the class label', () => {
        const base = makeRoot()
        const root: ComponentNode = {
            ...base,
            subComponents: [
                {
                    ...base.subComponents[0],
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
                base.subComponents[1],
            ],
        }
        const result = buildComponentClassDiagram(root.subComponents[0], root)
        expect(result.mermaidContent).toContain('class iface_ifoo_uuid["Foo Interface"] {')
        expect(result.mermaidContent).not.toContain('class iface_ifoo_uuid {')
    })

    it('generates realization arrows from component to each interface', () => {
        const root = makeRoot()
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).toContain('compA ..|> iface_ifoo_uuid')
        expect(result.mermaidContent).toContain('compA ..|> iface_ibar_uuid')
        expect(result.relationshipMetadata).toContainEqual({
            kind: 'implementation',
            sourceName: 'Component A',
            targetName: 'IFoo',
            sequenceDiagrams: [],
        })
    })

    it('includes click handler for the component itself', () => {
        const root = makeRoot()
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).toContain('click compA call __integraNavigate("compA")')
        expect(result.idToUuid['compA']).toBe('compa-uuid')
    })

    it('detects an actor caller and adds dependency arrow', () => {
        const sd = makeSeqDiagram(
            'actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething(id: string)'
        )
        const root = makeRoot([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).toContain('class user["User"]:::actor {')
        expect(result.mermaidContent).toContain('<<actor>>')
        expect(result.mermaidContent).toContain('user ..> iface_ifoo_uuid')
    })

    it('tracks sequence-diagram provenance for inbound dependency arrows', () => {
        const sd = makeSeqDiagram(
            'actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething(id: string)'
        )
        const root = makeRoot([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)

        expect(result.relationshipMetadata).toContainEqual({
            kind: 'dependency',
            sourceName: 'User',
            targetName: 'IFoo',
            sequenceDiagrams: [{ uuid: 'seq-uuid', name: 'Seq' }],
        })
    })

    it('detects a component caller and adds dependency arrow', () => {
        const sd = makeSeqDiagram(
            'component compB\ncomponent compA\ncompB ->> compA: IFoo:doSomething(id: string)'
        )
        const root = makeRoot([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).toContain('class compB["Component B"]')
        expect(result.mermaidContent).toContain('compB ..> iface_ifoo_uuid')
    })

    it("records caller's uuid in idToUuid for navigation", () => {
        const sd = makeSeqDiagram(
            'actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething(id: string)'
        )
        const root = makeRoot([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.idToUuid['user']).toBe('user-uuid')
        expect(result.mermaidContent).toContain('click user call __integraNavigate("user")')
    })

    it('deduplicates repeated calls from the same caller to the same interface', () => {
        const sd = makeSeqDiagram(
            [
                'actor user',
                'component compA',
                'user ->> compA: IFoo:doSomething(id: string)',
                'user ->> compA: IFoo:doSomething(id: string)',
            ].join('\n')
        )
        const root = makeRoot([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)
        const occurrences = (result.mermaidContent.match(/user \.\.> iface_ifoo_uuid/g) ?? [])
            .length
        expect(occurrences).toBe(1)
    })

    it('shows separate dependency arrows for calls to different interfaces', () => {
        const sd = makeSeqDiagram(
            [
                'actor user',
                'component compA',
                'user ->> compA: IFoo:doSomething(id: string)',
                'user ->> compA: IBar:getAll()',
            ].join('\n')
        )
        const root = makeRoot([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).toContain('user ..> iface_ifoo_uuid')
        expect(result.mermaidContent).toContain('user ..> iface_ibar_uuid')
    })

    it('skips the target component itself as a caller (self-reference)', () => {
        const sd = makeSeqDiagram(
            'component compA\ncomponent compA\ncompA ->> compA: IFoo:doSomething(id: string)',
            'compa-uuid'
        )
        const root = makeRoot([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).not.toContain('compA ..> iface_ifoo_uuid')
    })

    it('does not include callers when receiver resolves to a different component (disambiguation)', () => {
        // compC also has an IFoo interface; seq diagram calls compC's IFoo, not compA's
        const compC: ComponentNode = {
            uuid: 'compc-uuid',
            id: 'compC',
            name: 'Component C',
            type: 'component',
            subComponents: [],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [
                {
                    uuid: 'ifoo-c-uuid',
                    id: 'IFoo',
                    name: 'IFoo',
                    type: 'rest',
                    functions: [],
                },
            ],
        }
        const sd = makeSeqDiagram(
            'actor user\ncomponent compC\nuser ->> compC: IFoo:doSomething(id: string)'
        )
        const root: ComponentNode = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'Root',
            type: 'component',
            actors: [
                { uuid: 'user-uuid', id: 'user', name: 'User', type: 'actor', description: '' },
            ],
            subComponents: [
                {
                    ...getCompA(makeRoot()),
                    // compA has IFoo
                },
                compC,
            ],
            useCaseDiagrams: [makeUcd(makeUseCase(sd))],
            interfaces: [],
        }
        const result = buildComponentClassDiagram(root.subComponents[0], root)
        // user called compC's IFoo, not compA's IFoo — must not appear as compA dependent
        expect(result.mermaidContent).not.toContain('user ..> iface_ifoo_uuid')
        expect(result.idToUuid['user']).toBeUndefined()
    })

    it('returns empty mermaidContent when content is blank', () => {
        const sd = makeSeqDiagram('   ')
        const root = makeRoot([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)
        // No callers found, but interfaces exist — still shows interfaces
        expect(result.mermaidContent).toContain('classDiagram')
        expect(result.mermaidContent).not.toContain('user ..>')
    })

    it('formats optional parameters with trailing ?', () => {
        const root = makeRoot()
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).toContain('+getAll(page: number?)')
    })

    it('formats required parameters without ?', () => {
        const root = makeRoot()
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).toContain('+doSomething(id: string)')
        expect(result.mermaidContent).not.toContain('+doSomething(id: string?)')
    })

    it('finds callers inside an opt block', () => {
        const sd = makeSeqDiagram(
            [
                'actor user',
                'component compA',
                'opt if needed',
                '  user ->> compA: IFoo:doSomething(id: string)',
                'end',
            ].join('\n')
        )
        const root = makeRoot([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).toContain('user ..> iface_ifoo_uuid')
    })

    it('finds callers inside a loop block', () => {
        const sd = makeSeqDiagram(
            [
                'component compB',
                'component compA',
                'loop retry',
                '  compB ->> compA: IFoo:doSomething(id: string)',
                'end',
            ].join('\n')
        )
        const root = makeRoot([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).toContain('compB ..> iface_ifoo_uuid')
    })

    it('finds callers inside an alt/else block', () => {
        const sd = makeSeqDiagram(
            [
                'actor user',
                'component compA',
                'alt happy path',
                '  user ->> compA: IFoo:doSomething(id: string)',
                'else fallback',
                '  user ->> compA: IBar:getAll()',
                'end',
            ].join('\n')
        )
        const root = makeRoot([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).toContain('user ..> iface_ifoo_uuid')
        expect(result.mermaidContent).toContain('user ..> iface_ibar_uuid')
    })

    it('uses style directive to highlight subject component in blue', () => {
        const root = makeRoot()
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).toContain('style compA fill:#1d4ed8')
        expect(result.mermaidContent).not.toContain(':::subject')
    })

    it('emits style directives for subject and its own interfaces', () => {
        const root = makeRoot()
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).toContain(
            'style compA fill:#1d4ed8,stroke:#1e3a5f,color:#ffffff'
        )
        expect(result.mermaidContent).toContain(
            'style iface_ifoo_uuid fill:#bfdbfe,stroke:#2563eb,color:#1e3a5f'
        )
        expect(result.mermaidContent).toContain(
            'style iface_ibar_uuid fill:#bfdbfe,stroke:#2563eb,color:#1e3a5f'
        )
    })

    it('does not emit style directives for dependency interfaces (only own interfaces are highlighted)', () => {
        const sd = makeSeqDiagram(
            'component compA\ncomponent compB\ncompA ->> compB: IBaz:process(data: string)'
        )
        const root = makeRootWithCompBInterfaces([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)
        // IBaz is a dependency interface — should NOT have subject styling
        expect(result.mermaidContent).not.toContain('style iface_ibaz_uuid')
    })

    it("applies :::subjectInterface to subject's own interfaces", () => {
        const root = makeRoot()
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).toContain('style iface_ifoo_uuid fill:#bfdbfe')
        expect(result.mermaidContent).toContain('style iface_ibar_uuid fill:#bfdbfe')
    })

    it("shows outgoing call to another component's interface as dependency", () => {
        const sd = makeSeqDiagram(
            'component compA\ncomponent compB\ncompA ->> compB: IBaz:process(data: string)'
        )
        const root = makeRootWithCompBInterfaces([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)
        // dependency interface class with methods
        expect(result.mermaidContent).toContain('class iface_ibaz_uuid["IBaz"] {')
        expect(result.mermaidContent).toContain('+process(data: string)')
        // receiver implements interface
        expect(result.mermaidContent).toContain('compB ..|> iface_ibaz_uuid')
        // this component depends on interface
        expect(result.mermaidContent).toContain('compA ..> iface_ibaz_uuid')
        // receiver component class shown for context/navigation but no redundant direct arrow
        expect(result.mermaidContent).toContain('class compB["Component B"]')
        expect(result.mermaidContent).not.toContain('compA ..> compB')
    })

    it('renders separate interface boxes when two components share the same interface id', () => {
        const sd = makeSeqDiagram(
            'component compA\ncomponent compB\ncompA ->> compB: IFoo:process(data: string)'
        )
        const root: ComponentNode = {
            ...makeRoot([sd]),
            subComponents: [
                getCompA(makeRoot()),
                {
                    ...makeRoot().subComponents[1],
                    interfaces: [
                        {
                            uuid: 'ifoo-b-uuid',
                            id: 'IFoo',
                            name: 'IFoo',
                            type: 'rest',
                            functions: [
                                {
                                    uuid: 'ifoo-b-fn-uuid',
                                    id: 'process',
                                    parameters: [{ name: 'data', type: 'string', required: true }],
                                },
                            ],
                        },
                    ],
                },
            ],
        }

        const result = buildComponentClassDiagram(root.subComponents[0], root)

        expect(result.mermaidContent).toContain('class iface_ifoo_uuid["IFoo"] {')
        expect(result.mermaidContent).toContain('class iface_ifoo_b_uuid["IFoo"] {')
        expect(result.mermaidContent).toContain('compA ..|> iface_ifoo_uuid')
        expect(result.mermaidContent).toContain('compB ..|> iface_ifoo_b_uuid')
        expect(result.mermaidContent).toContain('compA ..> iface_ifoo_b_uuid')
    })

    it("records receiver's uuid in idToUuid for navigation", () => {
        const sd = makeSeqDiagram(
            'component compA\ncomponent compB\ncompA ->> compB: IBaz:process(data: string)'
        )
        const root = makeRootWithCompBInterfaces([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.idToUuid['compB']).toBe('compb-uuid')
    })

    it('does not show self-calls as outgoing dependencies', () => {
        const sd = makeSeqDiagram(
            'component compA\ncomponent compB\ncompA ->> compA: IFoo:doSomething(id: string)'
        )
        const root = makeRoot([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)
        // compA calling its own interface should not appear as a dependency
        expect(result.mermaidContent).not.toContain('compA ..> compA')
    })

    it('does not deduplicate: each unique interface call creates one arrow', () => {
        const sd = makeSeqDiagram(
            [
                'component compA',
                'component compB',
                'compA ->> compB: IBaz:process(data: string)',
                'compA ->> compB: IBaz:process(data: string)',
            ].join('\n')
        )
        const root = makeRootWithCompBInterfaces([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)
        // IBaz interface class should appear exactly once
        const matches = (result.mermaidContent.match(/class iface_ibaz_uuid/g) ?? []).length
        expect(matches).toBe(1)
    })

    it('shows both dependents and dependencies together', () => {
        // user calls compA (dependent); compA calls compB (dependency)
        const sdIncoming = makeSeqDiagram(
            'actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething(id: string)'
        )
        const sdOutgoing = {
            ...makeSeqDiagram(
                'component compA\ncomponent compB\ncompA ->> compB: IBaz:process(data: string)'
            ),
            id: 'seq-outgoing',
            uuid: 'seq-outgoing-uuid',
            name: 'Seq Outgoing',
        }
        const root = makeRootWithCompBInterfaces([sdIncoming, sdOutgoing])
        const result = buildComponentClassDiagram(getCompA(root), root)
        // dependents section
        expect(result.mermaidContent).toContain('user ..> iface_ifoo_uuid')
        // dependencies section
        expect(result.mermaidContent).toContain('compA ..> iface_ibaz_uuid')
        // no direct component arrow since interface arrow exists
        expect(result.mermaidContent).not.toContain('compA ..> compB')
    })

    // ── Function filtering tests ───────────────────────────────────────────────

    it('filters own interface to only the function called in a message', () => {
        // Build compA with a single interface IFoo having both doSomething and getAll
        const base = makeRoot()
        const rootCustom: typeof base = {
            ...base,
            subComponents: [
                {
                    ...base.subComponents[0],
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
                base.subComponents[1],
            ],
        }
        // Only doSomething is called, not getAll
        const sd = makeSeqDiagram(
            'actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething(id: string)'
        )
        const root = { ...rootCustom, useCaseDiagrams: [makeUcd(makeUseCase(sd))] }
        const result = buildComponentClassDiagram(root.subComponents[0], root)
        expect(result.mermaidContent).toContain('+doSomething(id: string)')
        expect(result.mermaidContent).not.toContain('+getAll(page: number?)')
    })

    it('shows all functions when no messages reference the interface (no callers)', () => {
        // No sequence diagrams at all — fall back to showing all functions
        const root = makeRoot()
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).toContain('+doSomething(id: string)')
        expect(result.mermaidContent).toContain('+getAll(page: number?)')
    })

    it('shows multiple called functions when multiple are referenced', () => {
        const sd = makeSeqDiagram(
            [
                'actor user',
                'component compA',
                'user ->> compA: IFoo:doSomething(id: string)',
                'user ->> compA: IFoo:getAll()',
            ].join('\n')
        )
        const root = makeRoot([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).toContain('+doSomething(id: string)')
        expect(result.mermaidContent).toContain('+getAll(page: number?)')
    })

    it('filters dependency interface to only the functions the subject calls', () => {
        // compA only calls IBaz.process — and IBaz has only process — verify it's shown
        const sd = makeSeqDiagram(
            'component compA\ncomponent compB\ncompA ->> compB: IBaz:process(data: string)'
        )
        const root = makeRootWithCompBInterfaces([sd])
        const result = buildComponentClassDiagram(getCompA(root), root)
        expect(result.mermaidContent).toContain('+process(data: string)')
    })

    it('shows parent functions for an inherited interface on the selected component', () => {
        const inheritedIface = {
            uuid: 'ifoo-child-uuid',
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
                    ...getCompA(makeRoot()),
                    interfaces: [inheritedIface],
                },
                makeRoot().subComponents[1],
            ],
        }

        const result = buildComponentClassDiagram(root.subComponents[0], root)
        expect(result.mermaidContent).toContain('+doSomething(id: string)')
        expect(result.mermaidContent).toContain('+getAll(page: number?)')
    })

    it('filters inherited interface functions after resolving them from the parent', () => {
        const inheritedIface = {
            uuid: 'ifoo-child-uuid',
            id: 'IFoo',
            name: 'IFoo',
            type: 'rest' as const,
            functions: [],
            parentInterfaceUuid: 'root-ifoo-uuid',
        }
        const sd = makeSeqDiagram(
            'actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething(id: string)'
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
                    ...getCompA(makeRoot()),
                    interfaces: [inheritedIface],
                },
                makeRoot().subComponents[1],
            ],
        }

        const result = buildComponentClassDiagram(root.subComponents[0], root)
        expect(result.mermaidContent).toContain('+doSomething(id: string)')
        expect(result.mermaidContent).not.toContain('+getAll(page: number?)')
    })

    it('emits a single realization link when a child inherits the selected component interface', () => {
        const parentSeq = makeSeqDiagram(
            'component childCaller\ncomponent childReceiver\nchildCaller ->> childReceiver: IFoo:doSomething(id: string)',
            'compa-uuid'
        )
        const root: ComponentNode = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'Root',
            type: 'component',
            actors: [],
            interfaces: [],
            useCaseDiagrams: [makeUcd(makeUseCase(parentSeq))],
            subComponents: [
                {
                    uuid: 'compa-uuid',
                    id: 'compA',
                    name: 'Component A',
                    type: 'component',
                    actors: [],
                    useCaseDiagrams: [],
                    interfaces: [
                        {
                            uuid: 'ifoo-parent-uuid',
                            id: 'IFoo',
                            name: 'IFoo',
                            type: 'rest',
                            functions: [
                                {
                                    uuid: 'ifoo-parent-fn-uuid',
                                    id: 'doSomething',
                                    parameters: [{ name: 'id', type: 'string', required: true }],
                                },
                            ],
                        },
                    ],
                    subComponents: [
                        {
                            uuid: 'child-receiver-uuid',
                            id: 'childReceiver',
                            name: 'Child Receiver',
                            type: 'component',
                            actors: [],
                            useCaseDiagrams: [],
                            subComponents: [],
                            interfaces: [
                                {
                                    uuid: 'ifoo-child-uuid',
                                    id: 'IFoo',
                                    name: 'IFoo',
                                    type: 'rest',
                                    functions: [],
                                    parentInterfaceUuid: 'ifoo-parent-uuid',
                                },
                            ],
                        },
                        {
                            uuid: 'child-caller-uuid',
                            id: 'childCaller',
                            name: 'Child Caller',
                            type: 'component',
                            actors: [],
                            useCaseDiagrams: [],
                            subComponents: [],
                            interfaces: [],
                        },
                    ],
                },
            ],
        }

        const result = buildComponentClassDiagram(root.subComponents[0], root)
        const occurrences = (
            result.mermaidContent.match(/compA \.\.\|> iface_ifoo_parent_uuid/g) ?? []
        ).length

        expect(occurrences).toBe(1)
    })

    it('delegates to root diagram when component is the root', () => {
        const root = makeRoot()
        const result = buildComponentClassDiagram(root, root)
        // Root diagram shows children, not the root itself as subject
        expect(result.mermaidContent).toContain('class compA["Component A"]')
        expect(result.mermaidContent).toContain('class compB["Component B"]')
    })

    describe('sibling restriction', () => {
        it('excludes a descendant of a sibling that calls the target', () => {
            // compB1 is a grandchild of root (child of compB) — not a sibling of compA
            const sd = makeSeqDiagram(
                'component compA\ncomponent compB/compB1\ncompB1 ->> compA: IFoo:doSomething(id: string)'
            )
            const root = makeRootWithGrandchild([sd])
            const result = buildComponentClassDiagram(getCompA(root), root)
            expect(result.mermaidContent).not.toContain('compB1')
        })

        it('excludes a descendant of a sibling that the target calls out to', () => {
            // compA calls compB1 (grandchild of root) — should not appear as dependency
            const sd = makeSeqDiagram(
                'component compA\ncomponent compB/compB1\ncompA ->> compB1: IB1:handle(x: string)'
            )
            const root = makeRootWithGrandchild([sd])
            const result = buildComponentClassDiagram(getCompA(root), root)
            expect(result.mermaidContent).not.toContain('compB1')
            expect(result.mermaidContent).not.toContain('IB1')
        })

        it('still includes a direct sibling that calls the target', () => {
            // compB is a direct sibling of compA — should still appear
            const sd = makeSeqDiagram(
                'component compB\ncomponent compA\ncompB ->> compA: IFoo:doSomething(id: string)'
            )
            const root = makeRootWithGrandchild([sd])
            const result = buildComponentClassDiagram(getCompA(root), root)
            expect(result.mermaidContent).toContain('class compB["Component B"]')
            expect(result.mermaidContent).toContain('compB ..> iface_ifoo_uuid')
        })
    })
})
