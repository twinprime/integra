// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type {
    ComponentNode,
    SequenceDiagramNode,
    UseCaseDiagramNode,
    UseCaseNode,
} from '../store/types'
import { buildRootClassDiagram } from './rootClassDiagram'

const makeSeqDiagram = (id: string, content: string): SequenceDiagramNode => ({
    uuid: `${id}-uuid`,
    id,
    name: id,
    type: 'sequence-diagram',
    content,
    description: '',
    ownerComponentUuid: 'root-uuid',
    referencedNodeIds: [],
    referencedFunctionUuids: [],
})

const makeUseCase = (id: string, ...sequenceDiagrams: SequenceDiagramNode[]): UseCaseNode => ({
    uuid: `${id}-uuid`,
    id,
    name: id,
    type: 'use-case',
    sequenceDiagrams,
})

const makeUseCaseDiagram = (id: string, ...useCases: UseCaseNode[]): UseCaseDiagramNode => ({
    uuid: `${id}-uuid`,
    id,
    name: id,
    type: 'use-case-diagram',
    content: '',
    description: '',
    ownerComponentUuid: 'root-uuid',
    referencedNodeIds: [],
    useCases,
})

function makeRoot(sequenceDiagrams: SequenceDiagramNode[] = []): ComponentNode {
    return {
        uuid: 'root-uuid',
        id: 'root',
        name: 'Root',
        type: 'component',
        actors: [{ uuid: 'user-uuid', id: 'user', name: 'User', type: 'actor', description: '' }],
        subComponents: [
            {
                uuid: 'sales-uuid',
                id: 'sales',
                name: 'Sales',
                type: 'component',
                subComponents: [
                    {
                        uuid: 'orders-uuid',
                        id: 'orders',
                        name: 'Orders',
                        type: 'component',
                        subComponents: [],
                        actors: [],
                        useCaseDiagrams: [],
                        interfaces: [],
                    },
                ],
                actors: [],
                useCaseDiagrams: [],
                interfaces: [],
            },
            {
                uuid: 'platform-uuid',
                id: 'platform',
                name: 'Platform',
                type: 'component',
                subComponents: [],
                actors: [],
                useCaseDiagrams: [],
                interfaces: [
                    {
                        uuid: 'platform-iface-uuid',
                        id: 'IPlatform',
                        name: 'IPlatform',
                        type: 'rest',
                        functions: [{ uuid: 'handle-fn-uuid', id: 'handle', parameters: [] }],
                    },
                ],
            },
        ],
        useCaseDiagrams: sequenceDiagrams.length
            ? [makeUseCaseDiagram('root-diagram', makeUseCase('root-flow', ...sequenceDiagrams))]
            : [],
        interfaces: [],
    }
}

describe('buildRootClassDiagram', () => {
    it('shows direct root children even with no sequence diagrams', () => {
        const result = buildRootClassDiagram(makeRoot())

        expect(result.mermaidContent).toContain('class sales["Sales"]')
        expect(result.mermaidContent).toContain('class platform["Platform"]')
        expect(result.mermaidContent).not.toContain('iface_platform_iface_uuid')
        expect(result.idToUuid.sales).toBe('sales-uuid')
        expect(result.idToUuid.platform).toBe('platform-uuid')
    })

    it('folds nested descendant dependencies to the direct root child', () => {
        const root = makeRoot([
            makeSeqDiagram(
                'root-flow',
                [
                    'component sales/orders as orders',
                    'component platform',
                    'orders ->> platform: IPlatform:handle()',
                ].join('\n')
            ),
        ])

        const result = buildRootClassDiagram(root)

        expect(result.mermaidContent).toContain('sales ..> iface_platform_iface_uuid')
        expect(result.mermaidContent).not.toContain('orders ..>')
    })

    it('does not render actors even when they participate in root-owned diagrams', () => {
        const root = makeRoot([
            makeSeqDiagram(
                'actor-root-flow',
                ['actor user', 'component platform', 'user ->> platform: IPlatform:handle()'].join(
                    '\n'
                )
            ),
        ])

        const result = buildRootClassDiagram(root)

        expect(result.mermaidContent).not.toContain('class user["User"]')
        expect(result.relationshipMetadata).not.toContainEqual(
            expect.objectContaining({ sourceName: 'User' })
        )
    })

    it('collapses interface dependencies to direct component links when interfaces are hidden', () => {
        const root = makeRoot([
            makeSeqDiagram(
                'collapse-root-interfaces',
                [
                    'component sales/orders as orders',
                    'component platform',
                    'orders ->> platform: IPlatform:handle()',
                ].join('\n')
            ),
        ])

        const result = buildRootClassDiagram(root, { showInterfaces: false })

        expect(result.mermaidContent).toContain('sales ..> platform')
        expect(result.mermaidContent).not.toContain('iface_platform_iface_uuid')
        expect(result.relationshipMetadata).toContainEqual({
            kind: 'dependency',
            sourceName: 'Sales',
            targetName: 'Platform',
            sequenceDiagrams: [
                { uuid: 'collapse-root-interfaces-uuid', name: 'collapse-root-interfaces' },
            ],
        })
    })
})
