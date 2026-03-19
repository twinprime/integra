// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type {
    ComponentNode,
    SequenceDiagramNode,
    UseCaseDiagramNode,
    UseCaseNode,
} from '../store/types'
import { buildUseCaseClassDiagram } from './useCaseClassDiagram'

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

function makeRoot(primaryUseCase?: UseCaseNode, secondaryUseCase?: UseCaseNode): ComponentNode {
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
                actors: [
                    { uuid: 'user-uuid', id: 'user', name: 'User', type: 'actor', description: '' },
                ],
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
                useCaseDiagrams:
                    primaryUseCase || secondaryUseCase
                        ? [
                              makeUseCaseDiagram(
                                  'compa-diagram',
                                  'compa-uuid',
                                  ...(primaryUseCase ? [primaryUseCase] : []),
                                  ...(secondaryUseCase ? [secondaryUseCase] : [])
                              ),
                          ]
                        : [],
                interfaces: [
                    {
                        uuid: 'subject-iface-uuid',
                        id: 'ISubject',
                        name: 'ISubject',
                        type: 'rest',
                        functions: [{ uuid: 'subject-ping-uuid', id: 'ping', parameters: [] }],
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
                        functions: [{ uuid: 'platform-handle-uuid', id: 'handle', parameters: [] }],
                    },
                ],
            },
        ],
        useCaseDiagrams: [],
        interfaces: [],
    }
}

describe('buildUseCaseClassDiagram', () => {
    it('returns empty when the use case has no sequence diagrams', () => {
        const result = buildUseCaseClassDiagram(makeUseCase('empty'), makeRoot())

        expect(result.mermaidContent).toBe('')
        expect(result.idToUuid).toEqual({})
    })

    it('shows only direct children and in-scope components for the owner component', () => {
        const primaryUseCase = makeUseCase(
            'primary',
            makeSeqDiagram(
                'entry',
                [
                    'actor user',
                    'component childSvc',
                    'component root/platform as platform',
                    'user ->> childSvc: IChild:run()',
                    'childSvc ->> platform: IPlatform:handle()',
                ].join('\n')
            )
        )
        const root = makeRoot(primaryUseCase)

        const result = buildUseCaseClassDiagram(primaryUseCase, root)

        expect(result.mermaidContent).toContain('class childSvc["Child Service"]')
        expect(result.mermaidContent).toContain('class platform["Platform"]')
        expect(result.mermaidContent).not.toContain('class compA["Component A"]')
        expect(result.mermaidContent).not.toContain('class user["User"]')
        expect(result.idToUuid).toEqual({
            childSvc: 'child-uuid',
            platform: 'platform-uuid',
        })
    })

    it('follows referenced use cases transitively', () => {
        const secondaryUseCase = makeUseCase(
            'secondary',
            makeSeqDiagram(
                'secondary-seq',
                [
                    'component childSvc',
                    'component root/platform as platform',
                    'childSvc ->> platform: IPlatform:handle()',
                ].join('\n')
            )
        )
        const primaryUseCase = makeUseCase(
            'primary',
            makeSeqDiagram(
                'entry',
                [
                    'component childSvc',
                    'component root/platform as platform',
                    'childSvc ->> platform: UseCase:secondary',
                ].join('\n')
            )
        )
        const root = makeRoot(primaryUseCase, secondaryUseCase)

        const result = buildUseCaseClassDiagram(primaryUseCase, root)

        expect(result.mermaidContent).toContain('class iface_platform_iface_uuid["IPlatform"] {')
        expect(result.mermaidContent).toContain('+handle()')
        expect(result.relationshipMetadata).toContainEqual({
            kind: 'dependency',
            sourceName: 'Child Service',
            targetName: 'IPlatform',
            sequenceDiagrams: [{ uuid: 'secondary-seq-uuid', name: 'secondary-seq' }],
        })
    })

    it('collapses hidden interfaces into direct component dependencies', () => {
        const primaryUseCase = makeUseCase(
            'primary',
            makeSeqDiagram(
                'entry',
                [
                    'component childSvc',
                    'component root/platform as platform',
                    'childSvc ->> platform: IPlatform:handle()',
                ].join('\n')
            )
        )
        const root = makeRoot(primaryUseCase)

        const result = buildUseCaseClassDiagram(primaryUseCase, root, { showInterfaces: false })

        expect(result.mermaidContent).toContain('childSvc ..> platform')
        expect(result.mermaidContent).not.toContain('iface_platform_iface_uuid')
        expect(result.relationshipMetadata).toContainEqual({
            kind: 'dependency',
            sourceName: 'Child Service',
            targetName: 'Platform',
            sequenceDiagrams: [{ uuid: 'entry-uuid', name: 'entry' }],
        })
    })
})
