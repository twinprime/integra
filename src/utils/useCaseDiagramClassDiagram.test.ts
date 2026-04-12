// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type {
    ComponentNode,
    SequenceDiagramNode,
    UseCaseDiagramNode,
    UseCaseNode,
} from '../store/types'
import { buildUseCaseDiagramClassDiagram } from './useCaseDiagramClassDiagram'

const makeSeqDiagram = (id: string, content: string): SequenceDiagramNode => ({
    uuid: `${id}-uuid`,
    id,
    name: id,
    type: 'sequence-diagram',
    content,
    description: '',
    ownerComponentUuid: 'compa-uuid',
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

const makeUseCaseDiagram = (...useCases: UseCaseNode[]): UseCaseDiagramNode => ({
    uuid: 'ucd-uuid',
    id: 'ucd',
    name: 'Use Case Diagram',
    type: 'use-case-diagram',
    content: '',
    description: '',
    ownerComponentUuid: 'compa-uuid',
    referencedNodeIds: [],
    useCases,
})

function makeRoot(useCaseDiagram: UseCaseDiagramNode): ComponentNode {
    return {
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
                subComponents: [
                    {
                        uuid: 'child-uuid',
                        id: 'childSvc',
                        name: 'Child Service',
                        type: 'component',
                        subComponents: [],
                        actors: [],
                        useCaseDiagrams: [],
                        interfaces: [
                            {
                                uuid: 'child-iface-uuid',
                                id: 'IChild',
                                name: 'IChild',
                                type: 'rest',
                                functions: [{ uuid: 'child-run-uuid', id: 'run', parameters: [] }],
                            },
                        ],
                    },
                ],
                actors: [
                    {
                        uuid: 'customer-uuid',
                        id: 'customer',
                        name: 'customer',
                        type: 'actor',
                        description: '',
                    },
                ],
                useCaseDiagrams: [useCaseDiagram],
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
                        functions: [{ uuid: 'platform-handle-uuid', id: 'handle', parameters: [] }],
                    },
                ],
            },
        ],
        useCaseDiagrams: [],
        interfaces: [],
    }
}

describe('buildUseCaseDiagramClassDiagram', () => {
    it('aggregates sequence diagrams across child use cases using the unified visibility rules', () => {
        const useCaseDiagram = makeUseCaseDiagram(
            makeUseCase(
                'uc-1',
                makeSeqDiagram(
                    'seq-1',
                    [
                        'actor customer',
                        'component childSvc',
                        'component root/platform as platform',
                        'customer ->> childSvc: start',
                        'childSvc ->> platform: IPlatform:handle()',
                    ].join('\n')
                )
            ),
            makeUseCase(
                'uc-2',
                makeSeqDiagram(
                    'seq-2',
                    [
                        'actor customer',
                        'component childSvc',
                        'component root/platform as platform',
                        'customer ->> childSvc: start',
                        'childSvc ->> platform: IPlatform:handle()',
                    ].join('\n')
                )
            )
        )
        const root = makeRoot(useCaseDiagram)

        const result = buildUseCaseDiagramClassDiagram(useCaseDiagram, root)

        expect(result.mermaidContent).toContain('class customer["customer"]:::actor')
        expect(result.mermaidContent).toContain('class childSvc["Child Service"]')
        expect(result.mermaidContent).toContain('class platform["Platform"]')
        expect(result.mermaidContent).toContain('+handle()')
        expect(result.mermaidContent).not.toContain('class compA["Component A"]')
        expect(result.mermaidContent).not.toContain('iface_child_iface_uuid')
        expect(result.relationshipMetadata).toContainEqual({
            kind: 'dependency',
            sourceName: 'customer',
            targetName: 'Child Service',
            sequenceDiagrams: [
                { uuid: 'seq-1-uuid', name: 'seq-1' },
                { uuid: 'seq-2-uuid', name: 'seq-2' },
            ],
        })
        expect(result.relationshipMetadata).toContainEqual({
            kind: 'dependency',
            sourceName: 'Child Service',
            targetName: 'IPlatform',
            sequenceDiagrams: [
                { uuid: 'seq-1-uuid', name: 'seq-1' },
                { uuid: 'seq-2-uuid', name: 'seq-2' },
            ],
        })
    })

    it('does not create a direct edge for diagram reference messages (useCaseDiagramRef, seqDiagramRef)', () => {
        const useCaseDiagram = makeUseCaseDiagram(
            makeUseCase(
                'uc-1',
                makeSeqDiagram(
                    'seq-1',
                    [
                        'component childSvc',
                        'component root/platform as platform',
                        'childSvc ->> platform: UseCaseDiagram:root/compA/compa-diagram',
                    ].join('\n')
                )
            )
        )
        const root = makeRoot(useCaseDiagram)

        const result = buildUseCaseDiagramClassDiagram(useCaseDiagram, root)

        expect(result.mermaidContent).not.toContain('childSvc ..> platform')
        expect(result.relationshipMetadata.filter(Boolean)).toHaveLength(0)
    })

    it('does not create class-diagram links for actor-sent diagram references', () => {
        const scenarios = [
            {
                name: 'use case reference',
                ref: 'UseCase:uc-2',
            },
            {
                name: 'use case diagram reference',
                ref: 'UseCaseDiagram:ucd',
            },
            {
                name: 'sequence diagram reference',
                ref: 'Sequence:secondary-seq',
            },
        ]

        for (const scenario of scenarios) {
            const useCaseDiagram = makeUseCaseDiagram(
                makeUseCase(
                    'uc-1',
                    makeSeqDiagram(
                        'seq-1',
                        [
                            'actor customer',
                            'component childSvc',
                            `customer ->> childSvc: ${scenario.ref}`,
                        ].join('\n')
                    )
                ),
                makeUseCase('uc-2', makeSeqDiagram('secondary-seq', ''))
            )
            const root = makeRoot(useCaseDiagram)

            const result = buildUseCaseDiagramClassDiagram(useCaseDiagram, root)

            expect(result.mermaidContent, scenario.name).not.toContain('customer ..>')
            expect(result.relationshipMetadata.filter(Boolean), scenario.name).toEqual([])
        }
    })

    it('collapses hidden interfaces across aggregated use cases', () => {
        const useCaseDiagram = makeUseCaseDiagram(
            makeUseCase(
                'uc-1',
                makeSeqDiagram(
                    'seq-1',
                    [
                        'component childSvc',
                        'component root/platform as platform',
                        'childSvc ->> platform: IPlatform:handle()',
                    ].join('\n')
                )
            )
        )
        const root = makeRoot(useCaseDiagram)

        const result = buildUseCaseDiagramClassDiagram(useCaseDiagram, root, {
            showInterfaces: false,
        })

        expect(result.mermaidContent).toContain('childSvc ..> platform')
        expect(result.mermaidContent).not.toContain('iface_platform_iface_uuid')
    })

    it('includes sequence diagrams referenced through UseCaseDiagram messages', () => {
        const referencedUseCaseDiagram: UseCaseDiagramNode = {
            uuid: 'shared-ucd-uuid',
            id: 'sharedFlows',
            name: 'Shared Flows',
            type: 'use-case-diagram',
            content: '',
            description: '',
            ownerComponentUuid: 'library-uuid',
            referencedNodeIds: [],
            useCases: [
                makeUseCase('shared-uc', {
                    ...makeSeqDiagram(
                        'shared-seq',
                        [
                            'component root/platform as platform',
                            'component root/compA/childSvc as childSvc',
                            'childSvc ->> platform: IPlatform:handle()',
                        ].join('\n')
                    ),
                    ownerComponentUuid: 'library-uuid',
                }),
            ],
        }
        const sourceUseCaseDiagram = makeUseCaseDiagram(
            makeUseCase(
                'uc-1',
                makeSeqDiagram(
                    'seq-1',
                    [
                        'component childSvc',
                        'childSvc ->> childSvc: UseCaseDiagram:root/library/sharedFlows',
                    ].join('\n')
                )
            )
        )
        const root = {
            ...makeRoot(sourceUseCaseDiagram),
            subComponents: [
                ...makeRoot(sourceUseCaseDiagram).subComponents,
                {
                    uuid: 'library-uuid',
                    id: 'library',
                    name: 'Library',
                    type: 'component' as const,
                    subComponents: [],
                    actors: [],
                    useCaseDiagrams: [referencedUseCaseDiagram],
                    interfaces: [],
                },
            ],
        }

        const result = buildUseCaseDiagramClassDiagram(sourceUseCaseDiagram, root)

        expect(result.relationshipMetadata).toContainEqual({
            kind: 'dependency',
            sourceName: 'Child Service',
            targetName: 'IPlatform',
            sequenceDiagrams: [{ uuid: 'shared-seq-uuid', name: 'shared-seq' }],
        })
    })

    // ── Inherited-interface link tests ────────────────────────────────────────

    /**
     * Builds a root where:
     *   root
     *     compA  (uuid: compa-uuid, owns the use-case diagram)
     *       callerSvc  (uuid: callersvc-uuid, the calling component)
     *     platform  (uuid: platform-uuid, visible sibling)
     *       IService interface (uuid: service-iface-uuid, has process())
     *       platformImpl  (uuid: platformimpl-uuid)
     *         IImpl interface (uuid: impl-iface-uuid, inherited from IService on platform)
     *
     * The sequence diagram declares `component root/platform/platformImpl as platformImpl`
     * so the resolver sees platformImpl's UUID but its visible representative is platform.
     * visibleReceiverMatchesActual === false → the new ancestor-interface branch fires.
     */
    /**
     * root
     *   compA (compa-uuid, owns diagram)
     *     callerSvc (callersvc-uuid)
     *   platform (platform-uuid)
     *     IService interface (service-iface-uuid, has process())
     *     platformImpl (platformimpl-uuid)
     *       IImpl interface (impl-iface-uuid, inherited from IService on platform)
     *         implFunctions: locally-added functions (default: none)
     *         implLocal: if true, IImpl is a plain local interface (not inherited)
     */
    function makeRootWithInheritedInterface(
        useCaseDiagram: UseCaseDiagramNode,
        opts: {
            implFunctions?: { uuid: string; id: string; parameters: [] }[]
            implLocal?: boolean
        } = {}
    ): ComponentNode {
        const implIface = opts.implLocal
            ? {
                  uuid: 'impl-iface-uuid',
                  id: 'IImpl',
                  name: 'IImpl',
                  type: 'rest' as const,
                  functions: [{ uuid: 'run-uuid', id: 'run', parameters: [] as [] }],
              }
            : {
                  uuid: 'impl-iface-uuid',
                  id: 'IImpl',
                  name: 'IImpl',
                  type: 'rest' as const,
                  kind: 'inherited' as const,
                  parentInterfaceUuid: 'service-iface-uuid',
                  functions:
                      opts.implFunctions ?? ([] as { uuid: string; id: string; parameters: [] }[]),
              }
        return {
            uuid: 'root-uuid',
            id: 'root',
            name: 'Root',
            type: 'component',
            actors: [],
            useCaseDiagrams: [],
            interfaces: [],
            subComponents: [
                {
                    uuid: 'compa-uuid',
                    id: 'compA',
                    name: 'Component A',
                    type: 'component',
                    actors: [],
                    useCaseDiagrams: [useCaseDiagram],
                    interfaces: [],
                    subComponents: [
                        {
                            uuid: 'callersvc-uuid',
                            id: 'callerSvc',
                            name: 'Caller Service',
                            type: 'component',
                            actors: [],
                            useCaseDiagrams: [],
                            interfaces: [],
                            subComponents: [],
                        },
                    ],
                },
                {
                    uuid: 'platform-uuid',
                    id: 'platform',
                    name: 'Platform',
                    type: 'component',
                    actors: [],
                    useCaseDiagrams: [],
                    interfaces: [
                        {
                            uuid: 'service-iface-uuid',
                            id: 'IService',
                            name: 'IService',
                            type: 'rest',
                            functions: [{ uuid: 'process-uuid', id: 'process', parameters: [] }],
                        },
                    ],
                    subComponents: [
                        {
                            uuid: 'platformimpl-uuid',
                            id: 'platformImpl',
                            name: 'Platform Impl',
                            type: 'component',
                            actors: [],
                            useCaseDiagrams: [],
                            interfaces: [implIface],
                            subComponents: [],
                        },
                    ],
                },
            ],
        }
    }

    // Sequence content: callerSvc calls platformImpl (out of scope under platform)
    const inheritedSeqContent = [
        'component callerSvc',
        'component root/platform/platformImpl as platformImpl',
        'callerSvc ->> platformImpl: IImpl:process()',
    ].join('\n')

    it('test 1: inherited function — links to ancestor interface, shows function in method list', () => {
        const useCaseDiagram = makeUseCaseDiagram(
            makeUseCase('uc-1', makeSeqDiagram('seq-1', inheritedSeqContent))
        )
        const root = makeRootWithInheritedInterface(useCaseDiagram)

        const result = buildUseCaseDiagramClassDiagram(useCaseDiagram, root)

        // Dependency edge points to the ancestor interface (IService on platform)
        expect(result.relationshipMetadata).toContainEqual(
            expect.objectContaining({
                kind: 'dependency',
                sourceName: 'Caller Service',
                targetName: 'IService',
            })
        )
        // Function appears in the interface method list
        expect(result.mermaidContent).toContain('+process()')
        // Interface node is rendered
        expect(result.mermaidContent).toContain('iface_service_iface_uuid')
        // Implementation edge: platform ..|> IService
        expect(result.mermaidContent).toContain('platform ..|> iface_service_iface_uuid')
        // No plain component edge to platform
        expect(result.relationshipMetadata).not.toContainEqual(
            expect.objectContaining({
                kind: 'dependency',
                sourceName: 'Caller Service',
                targetName: 'Platform',
            })
        )
    })

    it('test 2: child-added function on inherited interface — falls back to component edge', () => {
        const seqContent = [
            'component callerSvc',
            'component root/platform/platformImpl as platformImpl',
            'callerSvc ->> platformImpl: IImpl:childOnly()',
        ].join('\n')
        const useCaseDiagram = makeUseCaseDiagram(
            makeUseCase('uc-1', makeSeqDiagram('seq-1', seqContent))
        )
        // childOnly is locally added on IImpl
        const root = makeRootWithInheritedInterface(useCaseDiagram, {
            implFunctions: [{ uuid: 'child-only-uuid', id: 'childOnly', parameters: [] }],
        })

        const result = buildUseCaseDiagramClassDiagram(useCaseDiagram, root)

        // Falls back to a plain component dependency edge to the visible platform component
        expect(result.relationshipMetadata).toContainEqual(
            expect.objectContaining({
                kind: 'dependency',
                sourceName: 'Caller Service',
                targetName: 'Platform',
            })
        )
        // Ancestor interface should NOT appear
        expect(result.mermaidContent).not.toContain('iface_service_iface_uuid')
    })

    it('test 3: local (non-inherited) sub-component interface — falls back to component edge', () => {
        const seqContent = [
            'component callerSvc',
            'component root/platform/platformImpl as platformImpl',
            'callerSvc ->> platformImpl: IImpl:run()',
        ].join('\n')
        const useCaseDiagram = makeUseCaseDiagram(
            makeUseCase('uc-1', makeSeqDiagram('seq-1', seqContent))
        )
        // IImpl is a plain local interface (no parentInterfaceUuid)
        const root = makeRootWithInheritedInterface(useCaseDiagram, { implLocal: true })

        const result = buildUseCaseDiagramClassDiagram(useCaseDiagram, root)

        expect(result.relationshipMetadata).toContainEqual(
            expect.objectContaining({
                kind: 'dependency',
                sourceName: 'Caller Service',
                targetName: 'Platform',
            })
        )
        expect(result.mermaidContent).not.toContain('iface_service_iface_uuid')
    })

    it('test 4: multi-level chain — function not added at any intermediate, links to root interface', () => {
        // root
        //   compA (owns diagram)
        //     callerSvc
        //   platform (IService with process())
        //     platformChild (IChild: inherited from IService, no local functions)
        //       platformGrandChild (IGrand: inherited from IChild, no local functions)
        const seqContent = [
            'component callerSvc',
            'component root/platform/platformChild/platformGrandChild as platformGrandChild',
            'callerSvc ->> platformGrandChild: IGrand:process()',
        ].join('\n')
        const useCaseDiagram = makeUseCaseDiagram(
            makeUseCase('uc-1', makeSeqDiagram('seq-1', seqContent))
        )
        const root: ComponentNode = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'Root',
            type: 'component',
            actors: [],
            useCaseDiagrams: [],
            interfaces: [],
            subComponents: [
                {
                    uuid: 'compa-uuid',
                    id: 'compA',
                    name: 'Component A',
                    type: 'component',
                    actors: [],
                    useCaseDiagrams: [useCaseDiagram],
                    interfaces: [],
                    subComponents: [
                        {
                            uuid: 'callersvc-uuid',
                            id: 'callerSvc',
                            name: 'Caller Service',
                            type: 'component',
                            actors: [],
                            useCaseDiagrams: [],
                            interfaces: [],
                            subComponents: [],
                        },
                    ],
                },
                {
                    uuid: 'platform-uuid',
                    id: 'platform',
                    name: 'Platform',
                    type: 'component',
                    actors: [],
                    useCaseDiagrams: [],
                    interfaces: [
                        {
                            uuid: 'service-iface-uuid',
                            id: 'IService',
                            name: 'IService',
                            type: 'rest',
                            functions: [{ uuid: 'process-uuid', id: 'process', parameters: [] }],
                        },
                    ],
                    subComponents: [
                        {
                            uuid: 'platformchild-uuid',
                            id: 'platformChild',
                            name: 'Platform Child',
                            type: 'component',
                            actors: [],
                            useCaseDiagrams: [],
                            interfaces: [
                                {
                                    uuid: 'child-iface-uuid',
                                    id: 'IChild',
                                    name: 'IChild',
                                    type: 'rest',
                                    kind: 'inherited' as const,
                                    parentInterfaceUuid: 'service-iface-uuid',
                                    functions: [],
                                },
                            ],
                            subComponents: [
                                {
                                    uuid: 'platformgrandchild-uuid',
                                    id: 'platformGrandChild',
                                    name: 'Platform Grand Child',
                                    type: 'component',
                                    actors: [],
                                    useCaseDiagrams: [],
                                    interfaces: [
                                        {
                                            uuid: 'grand-iface-uuid',
                                            id: 'IGrand',
                                            name: 'IGrand',
                                            type: 'rest',
                                            kind: 'inherited' as const,
                                            parentInterfaceUuid: 'child-iface-uuid',
                                            functions: [],
                                        },
                                    ],
                                    subComponents: [],
                                },
                            ],
                        },
                    ],
                },
            ],
        }

        const result = buildUseCaseDiagramClassDiagram(useCaseDiagram, root)

        // Walks all the way up to IService on platform
        expect(result.relationshipMetadata).toContainEqual(
            expect.objectContaining({
                kind: 'dependency',
                sourceName: 'Caller Service',
                targetName: 'IService',
            })
        )
        expect(result.mermaidContent).toContain('+process()')
        expect(result.mermaidContent).toContain('platform ..|> iface_service_iface_uuid')
    })

    it('test 5: multi-level chain — function locally added at intermediate, falls back to component edge', () => {
        // Same structure as test 4, but IChild locally adds process() → walk stops at IChild → null → fallback
        const seqContent = [
            'component callerSvc',
            'component root/platform/platformChild/platformGrandChild as platformGrandChild',
            'callerSvc ->> platformGrandChild: IGrand:process()',
        ].join('\n')
        const useCaseDiagram = makeUseCaseDiagram(
            makeUseCase('uc-1', makeSeqDiagram('seq-1', seqContent))
        )
        const root: ComponentNode = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'Root',
            type: 'component',
            actors: [],
            useCaseDiagrams: [],
            interfaces: [],
            subComponents: [
                {
                    uuid: 'compa-uuid',
                    id: 'compA',
                    name: 'Component A',
                    type: 'component',
                    actors: [],
                    useCaseDiagrams: [useCaseDiagram],
                    interfaces: [],
                    subComponents: [
                        {
                            uuid: 'callersvc-uuid',
                            id: 'callerSvc',
                            name: 'Caller Service',
                            type: 'component',
                            actors: [],
                            useCaseDiagrams: [],
                            interfaces: [],
                            subComponents: [],
                        },
                    ],
                },
                {
                    uuid: 'platform-uuid',
                    id: 'platform',
                    name: 'Platform',
                    type: 'component',
                    actors: [],
                    useCaseDiagrams: [],
                    interfaces: [
                        {
                            uuid: 'service-iface-uuid',
                            id: 'IService',
                            name: 'IService',
                            type: 'rest',
                            functions: [{ uuid: 'process-uuid', id: 'process', parameters: [] }],
                        },
                    ],
                    subComponents: [
                        {
                            uuid: 'platformchild-uuid',
                            id: 'platformChild',
                            name: 'Platform Child',
                            type: 'component',
                            actors: [],
                            useCaseDiagrams: [],
                            interfaces: [
                                {
                                    uuid: 'child-iface-uuid',
                                    id: 'IChild',
                                    name: 'IChild',
                                    type: 'rest',
                                    kind: 'inherited' as const,
                                    parentInterfaceUuid: 'service-iface-uuid',
                                    // process() locally added here → walk terminates
                                    functions: [
                                        {
                                            uuid: 'child-process-uuid',
                                            id: 'process',
                                            parameters: [],
                                        },
                                    ],
                                },
                            ],
                            subComponents: [
                                {
                                    uuid: 'platformgrandchild-uuid',
                                    id: 'platformGrandChild',
                                    name: 'Platform Grand Child',
                                    type: 'component',
                                    actors: [],
                                    useCaseDiagrams: [],
                                    interfaces: [
                                        {
                                            uuid: 'grand-iface-uuid',
                                            id: 'IGrand',
                                            name: 'IGrand',
                                            type: 'rest',
                                            kind: 'inherited' as const,
                                            parentInterfaceUuid: 'child-iface-uuid',
                                            functions: [],
                                        },
                                    ],
                                    subComponents: [],
                                },
                            ],
                        },
                    ],
                },
            ],
        }

        const result = buildUseCaseDiagramClassDiagram(useCaseDiagram, root)

        // Falls back to plain component edge (platform)
        expect(result.relationshipMetadata).toContainEqual(
            expect.objectContaining({
                kind: 'dependency',
                sourceName: 'Caller Service',
                targetName: 'Platform',
            })
        )
        expect(result.mermaidContent).not.toContain('iface_service_iface_uuid')
    })

    it('test 6: showInterfaces: false — always falls back to component edge', () => {
        const useCaseDiagram = makeUseCaseDiagram(
            makeUseCase('uc-1', makeSeqDiagram('seq-1', inheritedSeqContent))
        )
        const root = makeRootWithInheritedInterface(useCaseDiagram)

        const result = buildUseCaseDiagramClassDiagram(useCaseDiagram, root, {
            showInterfaces: false,
        })

        // showInterfaces: false → always falls back to component
        expect(result.relationshipMetadata).toContainEqual(
            expect.objectContaining({
                kind: 'dependency',
                sourceName: 'Caller Service',
                targetName: 'Platform',
            })
        )
        expect(result.mermaidContent).not.toContain('iface_service_iface_uuid')
    })
})
