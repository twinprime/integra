/**
 * Mermaid generation tests for sequence diagrams.
 */
import { describe, it, expect } from 'vitest'
import { parseSequenceDiagramCst } from './parser'
import { buildSeqAst } from './visitor'
import { generateSequenceMermaidFromAst } from './mermaidGenerator'
import { buildSeqNavEntries } from './positionedVisitor'
import type { ComponentNode } from '../../store/types'
import { parse, parseAst, makeNamedComp } from './sequenceDiagram.test.helpers'

describe('generateSequenceMermaidFromAst — participant display labels', () => {
    it('uses node name instead of id for component participant', () => {
        const child = makeNamedComp('child-uuid', 'svc', 'Order Service')
        const owner = makeNamedComp('owner-uuid', 'owner', 'owner', [child])
        const root = makeNamedComp('root-uuid', 'root', 'root', [owner])
        const ast = parseAst('component svc')
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('Order Service')
        expect(mermaidContent).not.toContain('«component»\nsvc')
    })

    it('uses node name even when alias is specified (alias is local id only)', () => {
        const child = makeNamedComp('child-uuid', 'svc', 'Order Service')
        const owner = makeNamedComp('owner-uuid', 'owner', 'owner', [child])
        const root = makeNamedComp('root-uuid', 'root', 'root', [owner])
        const ast = parseAst('component svc as MyAlias')
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        // "MyAlias" is the Mermaid participant id; "Order Service" is the display label
        expect(mermaidContent).toContain('Order Service')
        expect(mermaidContent).toMatch(/participant MyAlias as .*Order Service/)
    })

    it('falls back to path segment when node not found', () => {
        const owner = makeNamedComp('owner-uuid', 'owner', 'owner')
        const root = makeNamedComp('root-uuid', 'root', 'root', [owner])
        const ast = parseAst('component unknown')
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('unknown')
    })
})

// ─── undeclared receivers ─────────────────────────────────────────────────────

describe('sequence diagram — undeclared receiver', () => {
    it("allows digit-only word in participant ref (e.g. 'Output Topics 2')", () => {
        const { ast, lexErrors, parseErrors } = parse('actor sender\nsender ->> Output Topics 2')
        expect(lexErrors).toHaveLength(0)
        expect(parseErrors).toHaveLength(0)
        expect(ast.messages[0].to).toBe('Output Topics 2')
    })

    it('auto-declares undeclared receiver with original spaced name as label', () => {
        const owner = makeNamedComp('owner-uuid', 'owner', 'owner')
        const root = makeNamedComp('root-uuid', 'root', 'root', [owner])
        const ast = parseAst('actor sender\nsender ->> Output Topics 2')
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('participant Output_Topics_2 as Output Topics 2')
    })

    it('does not double-declare a receiver that is already declared', () => {
        const child = makeNamedComp('svc-uuid', 'svc', 'My Service')
        const owner = makeNamedComp('owner-uuid', 'owner', 'owner', [child])
        const root = makeNamedComp('root-uuid', 'root', 'root', [owner])
        const ast = parseAst('component svc\nactor sender\nsender -->> svc')
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        const matches = mermaidContent.match(/participant svc/g)
        expect(matches).toHaveLength(1)
    })
})

describe('generateSequenceMermaidFromAst — UseCaseRef messages', () => {
    const makeCompWithUcs3 = (
        uuid: string,
        id: string,
        ucIds: { id: string; name: string }[]
    ): ComponentNode => ({
        uuid,
        id,
        name: id,
        type: 'component',
        actors: [],
        subComponents: [],
        interfaces: [],
        useCaseDiagrams: [
            {
                uuid: `${uuid}-ucd`,
                id: 'ucd',
                name: 'ucd',
                type: 'use-case-diagram',
                ownerComponentUuid: uuid,
                referencedNodeIds: [],
                content: '',
                useCases: ucIds.map((uc) => ({
                    uuid: `${uuid}-${uc.id}-uuid`,
                    id: uc.id,
                    name: uc.name,
                    type: 'use-case',
                    sequenceDiagrams: [],
                })),
            },
        ],
    })

    it('renders local UseCaseRef using use case name as label', () => {
        const owner = makeCompWithUcs3('owner-uuid', 'owner', [
            { id: 'placeOrder', name: 'Place Order' },
        ])
        const root = makeNamedComp('root-uuid', 'root', 'root', [owner])
        const ast = parseAst('actor customer\ncustomer ->> customer: UseCase:placeOrder')
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root, 'owner-uuid')
        expect(mermaidContent).toContain('customer->>customer: Place Order')
    })

    it('renders UseCaseRef with custom label overriding use case name', () => {
        const owner = makeCompWithUcs3('owner-uuid', 'owner', [
            { id: 'placeOrder', name: 'Place Order' },
        ])
        const root = makeNamedComp('root-uuid', 'root', 'root', [owner])
        const ast = parseAst(
            'actor customer\ncustomer ->> customer: UseCase:placeOrder:Custom Label'
        )
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root, 'owner-uuid')
        expect(mermaidContent).toContain('customer->>customer: Custom Label')
    })

    it('falls back to ucId when use case is not in tree', () => {
        const owner = makeNamedComp('owner-uuid', 'owner', 'owner')
        const root = makeNamedComp('root-uuid', 'root', 'root', [owner])
        const ast = parseAst('actor customer\ncustomer ->> customer: UseCase:unknownUc')
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root, 'owner-uuid')
        expect(mermaidContent).toContain('customer->>customer: unknownUc')
    })

    it('resolves a UseCaseRef that points at a cousin component', () => {
        const cousin = makeCompWithUcs3('cousin-uuid', 'cousin', [
            { id: 'placeOrder', name: 'Place Order' },
        ])
        const sibling = makeNamedComp('sibling-uuid', 'sibling', 'sibling', [cousin])
        const owner = makeNamedComp('owner-uuid', 'owner', 'owner')
        const root = makeNamedComp('root-uuid', 'root', 'root', [owner, sibling])
        const ast = parseAst(
            'actor customer\ncustomer ->> customer: UseCase:sibling/cousin/placeOrder'
        )

        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root, 'owner-uuid')

        expect(mermaidContent).toContain('customer->>customer: Place Order')
    })

    it('resolves a root-owned UseCaseRef that points at a nested descendant component', () => {
        const nested = makeCompWithUcs3('nested-uuid', 'nested', [
            { id: 'placeOrder', name: 'Place Order' },
        ])
        const service = makeNamedComp('service-uuid', 'service', 'service', [nested])
        const root = makeNamedComp('root-uuid', 'root', 'root', [service])
        const ast = parseAst(
            'actor customer\ncustomer ->> customer: UseCase:service/nested/placeOrder'
        )

        const { mermaidContent } = generateSequenceMermaidFromAst(ast, root, root, 'root-uuid')

        expect(mermaidContent).toContain('customer->>customer: Place Order')
    })

    it('populates messageLabelToUuid for UseCaseRef using the rendered display label as key', () => {
        const owner = makeCompWithUcs3('owner-uuid', 'owner', [
            { id: 'placeOrder', name: 'Place Order' },
        ])
        const root = makeNamedComp('root-uuid', 'root', 'root', [owner])
        const ast = parseAst('actor customer\ncustomer ->> customer: UseCase:placeOrder')
        const { messageLabelToUuid } = generateSequenceMermaidFromAst(
            ast,
            owner,
            root,
            'owner-uuid'
        )
        // Key is the rendered display label (use case name), NOT the raw spec string
        expect(messageLabelToUuid['Place Order']).toBe('owner-uuid-placeOrder-uuid')
        expect(messageLabelToUuid['UseCase:placeOrder']).toBeUndefined()
    })

    it('adds clickable messageLinks for resolved UseCaseRef labels', () => {
        const owner = makeCompWithUcs3('owner-uuid', 'owner', [
            { id: 'placeOrder', name: 'Place Order' },
        ])
        const root = makeNamedComp('root-uuid', 'root', 'root', [owner])
        const ast = parseAst('actor customer\ncustomer ->> customer: UseCase:placeOrder')
        const { messageLinks } = generateSequenceMermaidFromAst(ast, owner, root, 'owner-uuid')
        expect(messageLinks).toEqual([
            {
                kind: 'useCaseRef',
                renderedLabel: 'Place Order',
                targetUuid: 'owner-uuid-placeOrder-uuid',
                clickable: true,
            },
        ])
    })
})

// ─── generateSequenceMermaidFromAst — functionRef display label ───────────────

describe('generateSequenceMermaidFromAst — functionRef display label', () => {
    const makeCompWithIface2 = (uuid: string, id: string): ComponentNode => ({
        uuid,
        id,
        name: id,
        type: 'component',
        actors: [],
        subComponents: [],
        useCaseDiagrams: [],
        interfaces: [
            {
                uuid: `${uuid}-iface`,
                id: 'IFace',
                name: 'IFace',
                type: 'rest' as const,
                functions: [{ uuid: `${uuid}-fn`, id: 'doWork', parameters: [] }],
            },
        ],
    })

    it('uses function(paramNames) as default label when no display label suffix', () => {
        const owner = makeCompWithIface2('owner-uuid', 'owner')
        const root = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'root',
            type: 'component' as const,
            actors: [],
            subComponents: [owner],
            useCaseDiagrams: [],
            interfaces: [],
        }
        const ast = parseAst('actor caller\ncaller ->> owner: IFace:doWork()')
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('caller->>owner: doWork()')
        expect(mermaidContent).not.toContain('IFace:doWork()')
    })

    it('uses display label suffix as mermaid label when present', () => {
        const owner = makeCompWithIface2('owner-uuid', 'owner')
        const root = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'root',
            type: 'component' as const,
            actors: [],
            subComponents: [owner],
            useCaseDiagrams: [],
            interfaces: [],
        }
        const ast = parseAst('actor caller\ncaller ->> owner: IFace:doWork():process data')
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('caller->>owner: process data')
        expect(mermaidContent).not.toContain('doWork()')
    })

    it('converts \\n in function ref display label to <br/> in mermaid output', () => {
        const owner = makeCompWithIface2('owner-uuid', 'owner')
        const root = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'root',
            type: 'component' as const,
            actors: [],
            subComponents: [owner],
            useCaseDiagrams: [],
            interfaces: [],
        }
        const ast = parseAst('actor caller\ncaller ->> owner: IFace:doWork():Line1\\nLine2')
        const { mermaidContent, messageLabelToUuid } = generateSequenceMermaidFromAst(
            ast,
            owner,
            root
        )
        expect(mermaidContent).toContain('caller->>owner: Line1<br/>Line2')
        // Navigation key uses the clean label (with newline char, not <br/>) to match SVG textContent
        expect(messageLabelToUuid['Line1\nLine2']).toBeDefined()
    })

    it('populates messageLabelToUuid using the display label as key when present', () => {
        const owner = makeCompWithIface2('owner-uuid', 'owner')
        const root = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'root',
            type: 'component' as const,
            actors: [],
            subComponents: [owner],
            useCaseDiagrams: [],
            interfaces: [],
        }
        const ast = parseAst('actor caller\ncaller ->> owner: IFace:doWork():custom label')
        const { messageLabelToUuid } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(messageLabelToUuid['custom label']).toBeDefined()
        expect(messageLabelToUuid['doWork()']).toBeUndefined()
        expect(messageLabelToUuid['IFace:doWork()']).toBeUndefined()
    })

    it('falls back to function(paramNames) when trailing colon produces empty label', () => {
        const owner = makeCompWithIface2('owner-uuid', 'owner')
        const root = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'root',
            type: 'component' as const,
            actors: [],
            subComponents: [owner],
            useCaseDiagrams: [],
            interfaces: [],
        }
        const ast = parseAst('actor caller\ncaller ->> owner: IFace:doWork():')
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('caller->>owner: doWork()')
    })

    it('does not append suffix when the same function is called multiple times', () => {
        const owner = makeCompWithIface2('owner-uuid', 'owner')
        const root = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'root',
            type: 'component' as const,
            actors: [],
            subComponents: [owner],
            useCaseDiagrams: [],
            interfaces: [],
        }
        const ast = parseAst(
            'actor caller\ncaller ->> owner: IFace:doWork()\ncaller ->> owner: IFace:doWork()\ncaller ->> owner: IFace:doWork()'
        )
        const { mermaidContent, messageLabelToUuid } = generateSequenceMermaidFromAst(
            ast,
            owner,
            root
        )
        // All three calls are the same function → no suffix on any of them
        expect(mermaidContent.match(/caller->>owner: doWork\(\)/g)?.length).toBe(3)
        expect(mermaidContent).not.toContain('doWork() (2)')
        expect(mermaidContent).not.toContain('doWork() (3)')
        expect(messageLabelToUuid['doWork()']).toBeDefined()
    })

    it('appends (n) suffix when different functions produce the same base label', () => {
        // Two interfaces on the same component both have a function named "process"
        const owner: ComponentNode = {
            uuid: 'owner-uuid',
            id: 'owner',
            name: 'owner',
            type: 'component',
            actors: [],
            subComponents: [],
            useCaseDiagrams: [],
            interfaces: [
                {
                    uuid: 'iface1-uuid',
                    id: 'IFace1',
                    name: 'IFace1',
                    type: 'rest' as const,
                    functions: [{ uuid: 'fn1-uuid', id: 'process', parameters: [] }],
                },
                {
                    uuid: 'iface2-uuid',
                    id: 'IFace2',
                    name: 'IFace2',
                    type: 'rest' as const,
                    functions: [{ uuid: 'fn2-uuid', id: 'process', parameters: [] }],
                },
            ],
        }
        const root = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'root',
            type: 'component' as const,
            actors: [],
            subComponents: [owner],
            useCaseDiagrams: [],
            interfaces: [],
        }
        const ast = parseAst(
            'actor caller\ncaller ->> owner: IFace1:process()\ncaller ->> owner: IFace2:process()'
        )
        const { mermaidContent, messageLabelToUuid } = generateSequenceMermaidFromAst(
            ast,
            owner,
            root
        )
        expect(mermaidContent).toContain('caller->>owner: process()')
        expect(mermaidContent).toContain('caller->>owner: process() (2)')
        expect(messageLabelToUuid['process()']).toBeDefined()
        expect(messageLabelToUuid['process() (2)']).toBeDefined()
    })

    it('appends (n) suffix when same function is called on different receivers', () => {
        // Two components each have their own IFace interface with the same function
        const compA: ComponentNode = {
            uuid: 'compa-uuid',
            id: 'compA',
            name: 'compA',
            type: 'component',
            actors: [],
            subComponents: [],
            useCaseDiagrams: [],
            interfaces: [
                {
                    uuid: 'ifaceA-uuid',
                    id: 'IFace',
                    name: 'IFace',
                    type: 'rest' as const,
                    functions: [{ uuid: 'fnA-uuid', id: 'doWork', parameters: [] }],
                },
            ],
        }
        const compB: ComponentNode = {
            uuid: 'compb-uuid',
            id: 'compB',
            name: 'compB',
            type: 'component',
            actors: [],
            subComponents: [],
            useCaseDiagrams: [],
            interfaces: [
                {
                    uuid: 'ifaceB-uuid',
                    id: 'IFace',
                    name: 'IFace',
                    type: 'rest' as const,
                    functions: [{ uuid: 'fnB-uuid', id: 'doWork', parameters: [] }],
                },
            ],
        }
        const root = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'root',
            type: 'component' as const,
            actors: [],
            subComponents: [compA, compB],
            useCaseDiagrams: [],
            interfaces: [],
        }
        const ast = parseAst(
            'actor caller\ncaller ->> compA: IFace:doWork()\ncaller ->> compB: IFace:doWork()'
        )
        const { mermaidContent, messageLabelToUuid } = generateSequenceMermaidFromAst(
            ast,
            root,
            root
        )
        expect(mermaidContent).toContain('caller->>compA: doWork()')
        expect(mermaidContent).toContain('caller->>compB: doWork() (2)')
        expect(messageLabelToUuid['doWork()']).toBeDefined()
        expect(messageLabelToUuid['doWork() (2)']).toBeDefined()
    })

    it('includes param names in default label', () => {
        const owner = makeCompWithIface2('owner-uuid', 'owner')
        const root = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'root',
            type: 'component' as const,
            actors: [],
            subComponents: [owner],
            useCaseDiagrams: [],
            interfaces: [],
        }
        const ast = parseAst(
            'actor caller\ncaller ->> owner: IFace:doWork(userId: string, count: integer?)'
        )
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('caller->>owner: doWork(userId, count)')
    })

    it('populates messageLabelToInterfaceUuid with the interface uuid', () => {
        const owner = makeCompWithIface2('owner-uuid', 'owner')
        const root = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'root',
            type: 'component' as const,
            actors: [],
            subComponents: [owner],
            useCaseDiagrams: [],
            interfaces: [],
        }
        const ast = parseAst('actor caller\ncaller ->> owner: IFace:doWork()')
        const { messageLabelToInterfaceUuid } = generateSequenceMermaidFromAst(ast, owner, root)
        // "owner-uuid-iface" is the iface uuid from makeCompWithIface2
        expect(messageLabelToInterfaceUuid['doWork()']).toBe('owner-uuid-iface')
    })

    it('does not populate messageLabelToInterfaceUuid for unresolved interface', () => {
        const owner = makeCompWithIface2('owner-uuid', 'owner')
        const root = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'root',
            type: 'component' as const,
            actors: [],
            subComponents: [owner],
            useCaseDiagrams: [],
            interfaces: [],
        }
        const ast = parseAst('actor caller\ncaller ->> owner: IUnknown:doWork()')
        const { messageLabelToInterfaceUuid } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(messageLabelToInterfaceUuid['doWork()']).toBeUndefined()
    })

    it('returns ordered messageLinks so plain text stays distinct from clickable refs', () => {
        const owner: ComponentNode = {
            uuid: 'owner-uuid',
            id: 'owner',
            name: 'owner',
            type: 'component',
            actors: [],
            subComponents: [],
            interfaces: [
                {
                    uuid: 'owner-iface',
                    id: 'IFace',
                    name: 'IFace',
                    type: 'rest',
                    functions: [{ uuid: 'owner-fn', id: 'doWork', parameters: [] }],
                },
            ],
            useCaseDiagrams: [
                {
                    uuid: 'owner-ucd',
                    id: 'ucd',
                    name: 'ucd',
                    type: 'use-case-diagram',
                    ownerComponentUuid: 'owner-uuid',
                    referencedNodeIds: [],
                    content: '',
                    useCases: [
                        {
                            uuid: 'uc-uuid',
                            id: 'placeOrder',
                            name: 'Place Order',
                            type: 'use-case',
                            sequenceDiagrams: [
                                {
                                    uuid: 'seq-uuid',
                                    id: 'loginFlow',
                                    name: 'Login Flow',
                                    type: 'sequence-diagram',
                                    content: '',
                                    referencedNodeIds: [],
                                    ownerComponentUuid: 'owner-uuid',
                                    referencedFunctionUuids: [],
                                },
                            ],
                        },
                    ],
                },
            ],
        }
        const root = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'root',
            type: 'component' as const,
            actors: [],
            subComponents: [owner],
            useCaseDiagrams: [],
            interfaces: [],
        }
        const ast = parseAst(
            [
                'actor caller',
                'caller ->> owner: IFace:doWork():shared',
                'caller ->> owner: shared',
                'caller ->> owner: UseCase:placeOrder:shared',
                'caller ->> owner: Sequence:loginFlow',
            ].join('\n')
        )

        const { messageLinks } = generateSequenceMermaidFromAst(ast, owner, root, 'owner-uuid')
        expect(messageLinks).toEqual([
            {
                kind: 'functionRef',
                renderedLabel: 'shared',
                targetUuid: 'owner-uuid',
                interfaceUuid: 'owner-iface',
                clickable: true,
            },
            {
                kind: 'label',
                renderedLabel: 'shared',
                clickable: false,
            },
            {
                kind: 'useCaseRef',
                renderedLabel: 'shared (2)',
                targetUuid: 'uc-uuid',
                clickable: true,
            },
            {
                kind: 'seqDiagramRef',
                renderedLabel: 'Login Flow',
                targetUuid: 'seq-uuid',
                clickable: true,
            },
        ])
    })

    it('keeps Mermaid and readonly editor links aligned for duplicate sibling interface IDs', () => {
        const compA: ComponentNode = {
            uuid: 'compa-uuid',
            id: 'compA',
            name: 'compA',
            type: 'component',
            actors: [],
            subComponents: [],
            useCaseDiagrams: [],
            interfaces: [
                {
                    uuid: 'ifaceA-uuid',
                    id: 'IFace',
                    name: 'IFace',
                    type: 'rest' as const,
                    functions: [{ uuid: 'fnA-uuid', id: 'doWork', parameters: [] }],
                },
            ],
        }
        const compB: ComponentNode = {
            uuid: 'compb-uuid',
            id: 'compB',
            name: 'compB',
            type: 'component',
            actors: [],
            subComponents: [],
            useCaseDiagrams: [],
            interfaces: [
                {
                    uuid: 'ifaceB-uuid',
                    id: 'IFace',
                    name: 'IFace',
                    type: 'rest' as const,
                    functions: [{ uuid: 'fnB-uuid', id: 'doWork', parameters: [] }],
                },
            ],
        }
        const root = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'root',
            type: 'component' as const,
            actors: [],
            subComponents: [compA, compB],
            useCaseDiagrams: [],
            interfaces: [],
        }
        const content =
            'actor caller\ncaller ->> compA: IFace:doWork()\ncaller ->> compB: IFace:doWork()'
        const ast = parseAst(content)

        const { messageLabelToUuid, messageLabelToInterfaceUuid } = generateSequenceMermaidFromAst(
            ast,
            root,
            root
        )
        expect(messageLabelToUuid['doWork()']).toBe('compa-uuid')
        expect(messageLabelToUuid['doWork() (2)']).toBe('compb-uuid')
        expect(messageLabelToInterfaceUuid['doWork()']).toBe('ifaceA-uuid')
        expect(messageLabelToInterfaceUuid['doWork() (2)']).toBe('ifaceB-uuid')

        const navEntries = buildSeqNavEntries(content, root, root, 'root-uuid')
            .filter((entry) => entry.ifaceUuid != null)
            .map(({ uuid, ifaceUuid }) => ({ uuid, ifaceUuid }))
        expect(navEntries).toEqual([
            { uuid: 'compa-uuid', ifaceUuid: 'ifaceA-uuid' },
            { uuid: 'compb-uuid', ifaceUuid: 'ifaceB-uuid' },
        ])
    })
})

describe('generateSequenceMermaidFromAst — SequenceRef messages', () => {
    const makeCompWithSeqs2 = (
        uuid: string,
        id: string,
        seqs: { id: string; name: string }[]
    ): ComponentNode => ({
        uuid,
        id,
        name: id,
        type: 'component',
        actors: [],
        subComponents: [],
        interfaces: [],
        useCaseDiagrams: [
            {
                uuid: `${uuid}-ucd`,
                id: 'ucd',
                name: 'ucd',
                type: 'use-case-diagram',
                ownerComponentUuid: uuid,
                referencedNodeIds: [],
                content: '',
                useCases: [
                    {
                        uuid: `${uuid}-uc`,
                        id: 'uc',
                        name: 'uc',
                        type: 'use-case',
                        sequenceDiagrams: seqs.map((s) => ({
                            uuid: `${uuid}-uc-${s.id}-uuid`,
                            id: s.id,
                            name: s.name,
                            type: 'sequence-diagram' as const,
                            ownerComponentUuid: uuid,
                            referencedNodeIds: [],
                            referencedFunctionUuids: [],
                            content: '',
                        })),
                    },
                ],
            },
        ],
    })

    it('renders local SequenceRef using sequence diagram name as label', () => {
        const owner = makeCompWithSeqs2('owner-uuid', 'owner', [
            { id: 'loginFlow', name: 'Login Flow' },
        ])
        const root = makeNamedComp('root-uuid', 'root', 'root', [owner])
        const ast = parseAst('actor customer\ncustomer ->> customer: Sequence:loginFlow')
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root, 'owner-uuid')
        expect(mermaidContent).toContain('customer->>customer: Login Flow')
    })

    it('renders SequenceRef with custom label overriding sequence diagram name', () => {
        const owner = makeCompWithSeqs2('owner-uuid', 'owner', [
            { id: 'loginFlow', name: 'Login Flow' },
        ])
        const root = makeNamedComp('root-uuid', 'root', 'root', [owner])
        const ast = parseAst(
            'actor customer\ncustomer ->> customer: Sequence:loginFlow:Custom Label'
        )
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root, 'owner-uuid')
        expect(mermaidContent).toContain('customer->>customer: Custom Label')
    })

    it('falls back to seqId when sequence diagram is not in tree', () => {
        const owner = makeNamedComp('owner-uuid', 'owner', 'owner')
        const root = makeNamedComp('root-uuid', 'root', 'root', [owner])
        const ast = parseAst('actor customer\ncustomer ->> customer: Sequence:unknownSeq')
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root, 'owner-uuid')
        expect(mermaidContent).toContain('customer->>customer: unknownSeq')
    })

    it('resolves a SequenceRef that points at a cousin component', () => {
        const cousin = makeCompWithSeqs2('cousin-uuid', 'cousin', [
            { id: 'loginFlow', name: 'Login Flow' },
        ])
        const sibling = makeNamedComp('sibling-uuid', 'sibling', 'sibling', [cousin])
        const owner = makeNamedComp('owner-uuid', 'owner', 'owner')
        const root = makeNamedComp('root-uuid', 'root', 'root', [owner, sibling])
        const ast = parseAst(
            'actor customer\ncustomer ->> customer: Sequence:sibling/cousin/loginFlow'
        )

        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root, 'owner-uuid')

        expect(mermaidContent).toContain('customer->>customer: Login Flow')
    })

    it('resolves a root-owned SequenceRef that points at a nested descendant component', () => {
        const nested = makeCompWithSeqs2('nested-uuid', 'nested', [
            { id: 'loginFlow', name: 'Login Flow' },
        ])
        const service = makeNamedComp('service-uuid', 'service', 'service', [nested])
        const root = makeNamedComp('root-uuid', 'root', 'root', [service])
        const ast = parseAst(
            'actor customer\ncustomer ->> customer: Sequence:service/nested/loginFlow'
        )

        const { mermaidContent } = generateSequenceMermaidFromAst(ast, root, root, 'root-uuid')

        expect(mermaidContent).toContain('customer->>customer: Login Flow')
    })

    it('populates messageLabelToUuid for SequenceRef using the rendered display label as key', () => {
        const owner = makeCompWithSeqs2('owner-uuid', 'owner', [
            { id: 'loginFlow', name: 'Login Flow' },
        ])
        const root = makeNamedComp('root-uuid', 'root', 'root', [owner])
        const ast = parseAst('actor customer\ncustomer ->> customer: Sequence:loginFlow')
        const { messageLabelToUuid } = generateSequenceMermaidFromAst(
            ast,
            owner,
            root,
            'owner-uuid'
        )
        expect(messageLabelToUuid['Login Flow']).toBe('owner-uuid-uc-loginFlow-uuid')
        expect(messageLabelToUuid['Sequence:loginFlow']).toBeUndefined()
    })
})

// ─── Comment lines in mermaid output ─────────────────────────────────────────

describe('sequence diagram comment lines — mermaid generator', () => {
    const owner = {
        uuid: 'o',
        id: 'owner',
        name: 'owner',
        type: 'component' as const,
        actors: [],
        subComponents: [],
        useCaseDiagrams: [],
        interfaces: [],
    }
    const root = { ...owner, uuid: 'r', id: 'root', subComponents: [owner] }

    // Regression test for bug: comment line (#) caused "invalid diagram syntax"
    it('generates valid mermaid when spec contains a top-level comment line', () => {
        const { cst } = parseSequenceDiagramCst('actor a\nactor b\n# a comment\na ->> b: hello')
        const ast = buildSeqAst(cst)
        expect(() => generateSequenceMermaidFromAst(ast, owner, root)).not.toThrow()
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('a->>b: hello')
        expect(mermaidContent).not.toContain('undefined')
    })

    it('generates valid mermaid when comment appears between messages', () => {
        const { cst } = parseSequenceDiagramCst(
            'actor a\nactor b\na ->> b: first\n# mid comment\na ->> b: second'
        )
        const ast = buildSeqAst(cst)
        expect(() => generateSequenceMermaidFromAst(ast, owner, root)).not.toThrow()
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('a->>b: first')
        expect(mermaidContent).toContain('a->>b: second')
        expect(mermaidContent).not.toContain('undefined')
    })
})
