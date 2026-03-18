import { describe, expect, it } from 'vitest'
import type { ComponentNode, SequenceDiagramNode, UseCaseDiagramNode } from '../store/types'
import { extractDescriptionTodos, extractDiagramTodos, getAggregatedNodeTodos } from './nodeTodos'

function makeSequenceDiagramNode(
    overrides: Partial<SequenceDiagramNode> = {}
): SequenceDiagramNode {
    return {
        uuid: 'sequence-uuid',
        id: 'checkout_flow',
        name: 'Checkout Flow',
        type: 'sequence-diagram',
        description: '',
        content: '',
        referencedNodeIds: [],
        referencedFunctionUuids: [],
        ownerComponentUuid: 'use-case-uuid',
        ...overrides,
    }
}

function makeUseCaseDiagramNode(overrides: Partial<UseCaseDiagramNode> = {}): UseCaseDiagramNode {
    return {
        uuid: 'use-case-diagram-uuid',
        id: 'customer_journey',
        name: 'Customer Journey',
        type: 'use-case-diagram',
        description: '',
        content: '',
        referencedNodeIds: [],
        ownerComponentUuid: 'component-uuid',
        useCases: [],
        ...overrides,
    }
}

function makeRootComponent(overrides: Partial<ComponentNode> = {}): ComponentNode {
    return {
        uuid: 'root-uuid',
        id: 'root',
        name: 'Root System',
        type: 'component',
        description: '',
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
        ...overrides,
    }
}

describe('nodeTodos', () => {
    it('extracts TODOs from description HTML comments', () => {
        const node = makeRootComponent({
            description:
                'Intro <!-- TODO Review architecture --> text <!-- note --> <!-- TODO: Add docs -->',
        })

        expect(extractDescriptionTodos(node)).toEqual([
            {
                id: 'root-uuid:description:0:Review architecture',
                text: 'Review architecture',
                definingNodeUuid: 'root-uuid',
                definingNodeName: 'Root System',
                source: 'description',
            },
            {
                id: 'root-uuid:description:1:Add docs',
                text: 'Add docs',
                definingNodeUuid: 'root-uuid',
                definingNodeName: 'Root System',
                source: 'description',
            },
        ])
    })

    it('extracts TODOs from diagram TODO comments only', () => {
        const node = makeSequenceDiagramNode({
            content: [
                '# Local participants',
                '# TODO Review payment retries',
                'actor customer',
                '  # TODO: Clarify timeout handling',
            ].join('\n'),
        })

        expect(extractDiagramTodos(node)).toEqual([
            {
                id: 'sequence-uuid:diagram:1:Review payment retries',
                text: 'Review payment retries',
                definingNodeUuid: 'sequence-uuid',
                definingNodeName: 'Checkout Flow',
                source: 'diagram',
            },
            {
                id: 'sequence-uuid:diagram:3:Clarify timeout handling',
                text: 'Clarify timeout handling',
                definingNodeUuid: 'sequence-uuid',
                definingNodeName: 'Checkout Flow',
                source: 'diagram',
            },
        ])
    })

    it('aggregates a node subtree including diagram and descendant TODOs', () => {
        const sequenceDiagram = makeSequenceDiagramNode({
            uuid: 'seq-child-uuid',
            description: '<!-- TODO Describe payment handshake -->',
            content: '# TODO Verify fraud checks\nactor customer',
        })
        const root = makeRootComponent({
            description: '<!-- TODO Root cleanup -->',
            useCaseDiagrams: [
                makeUseCaseDiagramNode({
                    uuid: 'ucd-uuid',
                    name: 'Orders',
                    description: '<!-- TODO Review actors -->',
                    useCases: [
                        {
                            uuid: 'use-case-uuid',
                            id: 'place_order',
                            name: 'Place Order',
                            type: 'use-case',
                            description: '<!-- TODO Split happy path -->',
                            sequenceDiagrams: [sequenceDiagram],
                        },
                    ],
                }),
            ],
        })

        expect(getAggregatedNodeTodos(root, 'root-uuid').map((todo) => todo.text)).toEqual([
            'Root cleanup',
            'Review actors',
            'Split happy path',
            'Describe payment handshake',
            'Verify fraud checks',
        ])
        expect(
            getAggregatedNodeTodos(root, 'ucd-uuid').map((todo) => todo.definingNodeUuid)
        ).toEqual(['ucd-uuid', 'use-case-uuid', 'seq-child-uuid', 'seq-child-uuid'])
    })

    it('recomputes todos for a new immutable root tree', () => {
        const initialRoot = makeRootComponent({
            subComponents: [
                {
                    uuid: 'component-uuid',
                    id: 'orders',
                    name: 'Orders',
                    type: 'component',
                    description: '<!-- TODO Initial task -->',
                    subComponents: [],
                    actors: [],
                    useCaseDiagrams: [],
                    interfaces: [],
                },
            ],
        })

        expect(getAggregatedNodeTodos(initialRoot, 'root-uuid').map((todo) => todo.text)).toEqual([
            'Initial task',
        ])

        const updatedRoot = {
            ...initialRoot,
            subComponents: [
                {
                    ...initialRoot.subComponents[0],
                    description: '<!-- TODO Updated task -->',
                },
            ],
        }

        expect(getAggregatedNodeTodos(updatedRoot, 'root-uuid').map((todo) => todo.text)).toEqual([
            'Updated task',
        ])
    })
})
