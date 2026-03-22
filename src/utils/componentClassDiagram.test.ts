// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type {
    ComponentNode,
    SequenceDiagramNode,
    UseCaseDiagramNode,
    UseCaseNode,
} from '../store/types'
import { buildComponentClassDiagram } from './componentClassDiagram'

const makeSeqDiagram = (
    id: string,
    content: string,
    ownerComponentUuid = 'compa-uuid'
): SequenceDiagramNode => ({
    uuid: `${id}-uuid`,
    id,
    name: id,
    type: 'sequence-diagram',
    content,
    description: '',
    ownerComponentUuid,
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

const makeUseCaseDiagram = (
    id: string,
    ownerComponentUuid: string,
    ...useCases: UseCaseNode[]
): UseCaseDiagramNode => ({
    uuid: `${id}-uuid`,
    id,
    name: id,
    type: 'use-case-diagram',
    content: '',
    description: '',
    ownerComponentUuid,
    referencedNodeIds: [],
    useCases,
})

function makeRoot(
    componentSeqs: SequenceDiagramNode[] = [],
    rootSeqs: SequenceDiagramNode[] = []
): ComponentNode {
    return {
        uuid: 'root-uuid',
        id: 'root',
        name: 'Root',
        type: 'component',
        actors: [{ uuid: 'user-uuid', id: 'user', name: 'User', type: 'actor', description: '' }],
        subComponents: [
            {
                uuid: 'compa-uuid',
                id: 'compA',
                name: 'Component A',
                type: 'component',
                actors: [
                    {
                        uuid: 'local-user-uuid',
                        id: 'user',
                        name: 'User',
                        type: 'actor',
                        description: '',
                    },
                ],
                subComponents: [
                    {
                        uuid: 'child-uuid',
                        id: 'childSvc',
                        name: 'Child Service',
                        type: 'component',
                        subComponents: [
                            {
                                uuid: 'worker-uuid',
                                id: 'worker',
                                name: 'Worker',
                                type: 'component',
                                subComponents: [],
                                actors: [],
                                useCaseDiagrams: [],
                                interfaces: [],
                            },
                        ],
                        actors: [],
                        useCaseDiagrams: [],
                        interfaces: [
                            {
                                uuid: 'child-iface-uuid',
                                id: 'IChild',
                                name: 'IChild',
                                type: 'rest',
                                functions: [{ uuid: 'child-fn-uuid', id: 'run', parameters: [] }],
                            },
                        ],
                    },
                ],
                useCaseDiagrams: componentSeqs.length
                    ? [
                          makeUseCaseDiagram(
                              'compA-diagram',
                              'compa-uuid',
                              makeUseCase('compA-flow', ...componentSeqs)
                          ),
                      ]
                    : [],
                interfaces: [
                    {
                        uuid: 'subject-iface-uuid',
                        id: 'ISubject',
                        name: 'ISubject',
                        type: 'rest',
                        functions: [{ uuid: 'subject-fn-uuid', id: 'ping', parameters: [] }],
                    },
                ],
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
                        functions: [
                            { uuid: 'handle-fn-uuid', id: 'handle', parameters: [] },
                            { uuid: 'audit-fn-uuid', id: 'audit', parameters: [] },
                        ],
                    },
                ],
            },
        ],
        useCaseDiagrams: rootSeqs.length
            ? [
                  makeUseCaseDiagram(
                      'root-diagram',
                      'root-uuid',
                      makeUseCase('root-flow', ...rootSeqs)
                  ),
              ]
            : [],
        interfaces: [],
    }
}

describe('buildComponentClassDiagram', () => {
    it('does not show the selected component when no dependency links reference it', () => {
        const root = makeRoot()
        const subject = { ...root.subComponents[1], interfaces: [] }

        const result = buildComponentClassDiagram(subject, root)

        expect(result.mermaidContent).toBe('')
        expect(result.idToUuid.platform).toBeUndefined()
    })

    it('shows the selected component when a dependency link involves it', () => {
        const root = makeRoot([
            makeSeqDiagram(
                'subject-dependency',
                [
                    'component compA',
                    'component root/platform as platform',
                    'compA ->> platform: IPlatform:handle()',
                ].join('\n')
            ),
        ])

        const result = buildComponentClassDiagram(root.subComponents[0], root)

        expect(result.mermaidContent).toContain('class compA["Component A"]')
        expect(result.mermaidContent).toContain('compA ..> iface_platform_iface_uuid')
    })

    it('ignores X-prefixed arrows when computing dependency links', () => {
        const root = makeRoot([
            makeSeqDiagram(
                'excluded-dependency',
                [
                    'component compA',
                    'component root/platform as platform',
                    'compA X->> platform: IPlatform:handle()',
                ].join('\n')
            ),
        ])

        const result = buildComponentClassDiagram(root.subComponents[0], root)

        expect(result.mermaidContent).toBe('')
        expect(result.relationshipMetadata).toEqual([])
    })

    it('ignores self-messages when computing dependency links', () => {
        const root = makeRoot([
            makeSeqDiagram(
                'self-message',
                ['component compA', 'compA ->> compA: ISubject:ping()'].join('\n')
            ),
        ])

        const result = buildComponentClassDiagram(root.subComponents[0], root)

        expect(result.mermaidContent).toContain('class compA["Component A"]')
        expect(result.mermaidContent).not.toContain('..>')
        expect(result.mermaidContent).not.toContain('iface_subject_iface_uuid')
        expect(result.relationshipMetadata).toEqual([])
    })

    it('uses only sequence diagrams owned under the selected component subtree', () => {
        const root = makeRoot(
            [
                makeSeqDiagram(
                    'component-owned',
                    [
                        'component childSvc',
                        'component root/platform as platform',
                        'childSvc ->> platform: IPlatform:handle()',
                    ].join('\n')
                ),
            ],
            [
                makeSeqDiagram(
                    'root-owned',
                    ['actor user', 'component compA', 'user ->> compA: ISubject:ping()'].join('\n'),
                    'root-uuid'
                ),
            ]
        )

        const result = buildComponentClassDiagram(root.subComponents[0], root)

        expect(result.mermaidContent).toContain('class childSvc["Child Service"]')
        expect(result.mermaidContent).toContain('class platform["Platform"]')
        expect(result.mermaidContent).not.toContain('class user["User"]:::actor')
        expect(result.relationshipMetadata).not.toContainEqual(
            expect.objectContaining({ sourceName: 'User' })
        )
    })

    it('renders actors from sequence diagrams owned under the selected component subtree', () => {
        const root = makeRoot([
            makeSeqDiagram(
                'component-owned-actor',
                [
                    'actor user',
                    'component childSvc',
                    'component root/platform as platform',
                    'user ->> childSvc: IChild:run()',
                    'childSvc ->> platform: IPlatform:handle()',
                ].join('\n')
            ),
        ])

        const result = buildComponentClassDiagram(root.subComponents[0], root)

        expect(result.mermaidContent).toContain('class user["User"]:::actor')
        expect(result.relationshipMetadata).toContainEqual(
            expect.objectContaining({ sourceName: 'User', targetName: 'IChild' })
        )
    })

    it('folds nested descendants to their closest visible in-scope ancestor', () => {
        const root = makeRoot([
            makeSeqDiagram(
                'fold-descendants',
                [
                    'component root/compA/childSvc/worker as worker',
                    'component root/platform as platform',
                    'worker ->> platform: IPlatform:handle()',
                ].join('\n')
            ),
        ])

        const result = buildComponentClassDiagram(root.subComponents[0], root)

        expect(result.mermaidContent).toContain('childSvc ..> iface_platform_iface_uuid')
        expect(result.mermaidContent).not.toContain('worker ..>')
    })

    it('shows included component interfaces and filters them to called methods', () => {
        const root = makeRoot([
            makeSeqDiagram(
                'filter-platform-methods',
                [
                    'component childSvc',
                    'component root/platform as platform',
                    'childSvc ->> platform: IPlatform:handle()',
                ].join('\n')
            ),
        ])

        const result = buildComponentClassDiagram(root.subComponents[0], root)

        expect(result.mermaidContent).toContain('class iface_platform_iface_uuid["IPlatform"] {')
        expect(result.mermaidContent).toContain('+handle()')
        expect(result.mermaidContent).not.toContain('+audit()')
        expect(result.mermaidContent).not.toContain('compA ..|> iface_subject_iface_uuid')
    })

    it('collapses interface dependencies to component links when interfaces are hidden', () => {
        const root = makeRoot([
            makeSeqDiagram(
                'collapse-hidden',
                [
                    'component childSvc',
                    'component root/platform as platform',
                    'childSvc ->> platform: IPlatform:handle()',
                ].join('\n')
            ),
        ])

        const result = buildComponentClassDiagram(root.subComponents[0], root, {
            showInterfaces: false,
        })

        expect(result.mermaidContent).toContain('childSvc ..> platform')
        expect(result.mermaidContent).not.toContain('iface_platform_iface_uuid')
        expect(result.relationshipMetadata).toContainEqual({
            kind: 'dependency',
            sourceName: 'Child Service',
            targetName: 'Platform',
            sequenceDiagrams: [{ uuid: 'collapse-hidden-uuid', name: 'collapse-hidden' }],
        })
    })

    it('does not treat parent-targeted calls as dependencies on a child inherited interface', () => {
        const childSequence = makeSeqDiagram(
            'parent-targeted-call',
            [
                'actor user',
                'component compA',
                'component root as root',
                'compA ->> root: API:doThing()',
            ].join('\n'),
            'child-uuid'
        )

        const root: ComponentNode = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'Root',
            type: 'component',
            description: '',
            actors: [
                { uuid: 'user-uuid', id: 'user', name: 'User', type: 'actor', description: '' },
            ],
            interfaces: [
                {
                    uuid: 'root-api-iface-uuid',
                    id: 'API',
                    name: 'API',
                    type: 'rest',
                    functions: [{ uuid: 'root-fn-uuid', id: 'doThing', parameters: [] }],
                },
            ],
            useCaseDiagrams: [],
            subComponents: [
                {
                    uuid: 'child-uuid',
                    id: 'compA',
                    name: 'Component A',
                    type: 'component',
                    description: '',
                    actors: [],
                    interfaces: [
                        {
                            uuid: 'child-api-iface-uuid',
                            id: 'API',
                            name: 'API',
                            type: 'rest',
                            parentInterfaceUuid: 'root-api-iface-uuid',
                            functions: [],
                        },
                    ],
                    useCaseDiagrams: [
                        makeUseCaseDiagram(
                            'child-diagram',
                            'child-uuid',
                            makeUseCase('child-flow', childSequence)
                        ),
                    ],
                    subComponents: [],
                },
            ],
        }

        const result = buildComponentClassDiagram(root.subComponents[0], root)

        expect(result.mermaidContent).not.toContain('iface_child_api_iface_uuid')
        expect(result.relationshipMetadata).not.toContainEqual(
            expect.objectContaining({ targetName: 'API', sourceName: 'Component A' })
        )
    })
})
