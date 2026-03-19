// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type {
    ComponentNode,
    SequenceDiagramNode,
    UseCaseDiagramNode,
    UseCaseNode,
} from '../store/types'
import { buildUseCaseDiagramClassDiagram } from './useCaseDiagramClassDiagram'

const makeSeqDiagram = (uuid: string, content: string): SequenceDiagramNode => ({
    uuid,
    id: uuid,
    name: `Sequence ${uuid}`,
    type: 'sequence-diagram',
    content,
    description: '',
    ownerComponentUuid: 'compa-uuid',
    referencedNodeIds: [],
    referencedFunctionUuids: [],
})

const makeUseCase = (uuid: string, ...sequenceDiagrams: SequenceDiagramNode[]): UseCaseNode => ({
    uuid,
    id: uuid,
    name: `Use Case ${uuid}`,
    type: 'use-case',
    sequenceDiagrams,
})

const makeRoot = (): ComponentNode => ({
    uuid: 'root-uuid',
    id: 'root',
    name: 'Root',
    type: 'component',
    subComponents: [
        {
            uuid: 'compa-uuid',
            id: 'compA',
            name: 'Component A',
            type: 'component',
            subComponents: [],
            actors: [{ uuid: 'user-uuid', id: 'user', name: 'User', type: 'actor' }],
            useCaseDiagrams: [],
            interfaces: [
                {
                    uuid: 'ifoo-uuid',
                    id: 'IFoo',
                    name: 'IFoo',
                    type: 'rest',
                    functions: [{ uuid: 'ifoo-fn-uuid', id: 'doSomething', parameters: [] }],
                },
                {
                    uuid: 'ibar-uuid',
                    id: 'IBar',
                    name: 'IBar',
                    type: 'rest',
                    functions: [{ uuid: 'ibar-fn-uuid', id: 'getAll', parameters: [] }],
                },
            ],
        },
    ],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
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

describe('buildUseCaseDiagramClassDiagram', () => {
    it('returns empty when no sequence diagrams exist across child use cases', () => {
        const result = buildUseCaseDiagramClassDiagram(
            makeUseCaseDiagram(makeUseCase('uc-1'), makeUseCase('uc-2')),
            makeRoot()
        )

        expect(result.mermaidContent).toBe('')
        expect(result.idToUuid).toEqual({})
    })

    it('aggregates sequence diagrams across all child use cases', () => {
        const result = buildUseCaseDiagramClassDiagram(
            makeUseCaseDiagram(
                makeUseCase(
                    'uc-1',
                    makeSeqDiagram(
                        'seq-1',
                        'actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()'
                    )
                ),
                makeUseCase(
                    'uc-2',
                    makeSeqDiagram(
                        'seq-2',
                        'actor user\ncomponent compA\nuser ->> compA: IBar:getAll()'
                    )
                )
            ),
            makeRoot()
        )

        expect(result.mermaidContent).toContain('class iface_ifoo_uuid["IFoo"] {')
        expect(result.mermaidContent).toContain('class iface_ibar_uuid["IBar"] {')
        expect(result.mermaidContent).toContain('+doSomething()')
        expect(result.mermaidContent).toContain('+getAll()')
        expect(result.mermaidContent.match(/class user\["User"\]:::actor/g) ?? []).toHaveLength(1)
        expect(result.relationshipMetadata).toContainEqual({
            kind: 'dependency',
            sourceName: 'User',
            targetName: 'IFoo',
            sequenceDiagrams: [{ uuid: 'seq-1', name: 'Sequence seq-1' }],
        })
        expect(result.relationshipMetadata).toContainEqual({
            kind: 'dependency',
            sourceName: 'User',
            targetName: 'IBar',
            sequenceDiagrams: [{ uuid: 'seq-2', name: 'Sequence seq-2' }],
        })
    })

    it('collapses hidden interfaces across aggregated use cases', () => {
        const result = buildUseCaseDiagramClassDiagram(
            makeUseCaseDiagram(
                makeUseCase(
                    'uc-1',
                    makeSeqDiagram(
                        'seq-1',
                        'actor user\ncomponent compA\nuser ->> compA: IFoo:doSomething()'
                    )
                ),
                makeUseCase(
                    'uc-2',
                    makeSeqDiagram(
                        'seq-2',
                        'actor user\ncomponent compA\nuser ->> compA: IBar:getAll()'
                    )
                )
            ),
            makeRoot(),
            { showInterfaces: false }
        )

        expect(result.mermaidContent).toContain('user ..> compA')
        expect(result.mermaidContent).not.toContain('iface_ifoo_uuid')
        expect(result.mermaidContent).not.toContain('iface_ibar_uuid')
        expect(result.mermaidContent.match(/user \.\.> compA/g) ?? []).toHaveLength(1)
        expect(result.relationshipMetadata).toContainEqual({
            kind: 'dependency',
            sourceName: 'User',
            targetName: 'Component A',
            sequenceDiagrams: [
                { uuid: 'seq-1', name: 'Sequence seq-1' },
                { uuid: 'seq-2', name: 'Sequence seq-2' },
            ],
        })
    })
})
