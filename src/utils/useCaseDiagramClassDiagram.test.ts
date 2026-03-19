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
                actors: [],
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
                        'component childSvc',
                        'component root/platform as platform',
                        'childSvc ->> platform: IPlatform:handle()',
                    ].join('\n')
                )
            ),
            makeUseCase(
                'uc-2',
                makeSeqDiagram(
                    'seq-2',
                    [
                        'component childSvc',
                        'component root/platform as platform',
                        'childSvc ->> platform: IPlatform:handle()',
                    ].join('\n')
                )
            )
        )
        const root = makeRoot(useCaseDiagram)

        const result = buildUseCaseDiagramClassDiagram(useCaseDiagram, root)

        expect(result.mermaidContent).toContain('class childSvc["Child Service"]')
        expect(result.mermaidContent).toContain('class platform["Platform"]')
        expect(result.mermaidContent).toContain('+handle()')
        expect(result.mermaidContent).not.toContain('class compA["Component A"]')
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
})
