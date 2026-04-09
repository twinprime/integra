import { describe, expect, it } from 'vitest'
import type {
    ComponentNode,
    SequenceDiagramNode,
    UseCaseDiagramNode,
    UseCaseNode,
} from '../store/types'
import {
    buildFunctionReferenceLookup,
    getFunctionTargetReferences,
    getInterfaceReferencedFunctionIds,
} from './functionReferenceLookup'

function makeSequenceDiagram(
    id: string,
    ownerComponentUuid: string,
    content: string
): SequenceDiagramNode {
    return {
        uuid: `${id}-uuid`,
        id,
        name: id,
        type: 'sequence-diagram',
        content,
        ownerComponentUuid,
        referencedNodeIds: [],
        referencedFunctionUuids: [],
    }
}

function makeUseCase(id: string, ...sequenceDiagrams: SequenceDiagramNode[]): UseCaseNode {
    return {
        uuid: `${id}-uuid`,
        id,
        name: id,
        type: 'use-case',
        sequenceDiagrams,
    }
}

function makeUseCaseDiagram(
    id: string,
    ownerComponentUuid: string,
    ...useCases: UseCaseNode[]
): UseCaseDiagramNode {
    return {
        uuid: `${id}-uuid`,
        id,
        name: id,
        type: 'use-case-diagram',
        content: '',
        ownerComponentUuid,
        referencedNodeIds: [],
        useCases,
    }
}

describe('function reference lookup', () => {
    it('tracks inherited child references separately from parent interface references', () => {
        const parentSequence = makeSequenceDiagram(
            'parent-flow',
            'root-uuid',
            ['actor User', 'component root', 'User ->> root: API:doThing()'].join('\n')
        )
        const childSequence = makeSequenceDiagram(
            'child-flow',
            'child-uuid',
            ['actor User', 'component child', 'User ->> child: API:doThing()'].join('\n')
        )

        const root: ComponentNode = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'Root',
            type: 'component',
            description: '',
            actors: [
                { uuid: 'user-uuid', id: 'User', name: 'User', type: 'actor', description: '' },
            ],
            interfaces: [
                {
                    uuid: 'parent-iface-uuid',
                    id: 'API',
                    name: 'API',
                    type: 'rest',
                    functions: [{ uuid: 'parent-fn-uuid', id: 'doThing', parameters: [] }],
                },
            ],
            useCaseDiagrams: [
                makeUseCaseDiagram(
                    'root-diagram',
                    'root-uuid',
                    makeUseCase('root-uc', parentSequence)
                ),
            ],
            subComponents: [
                {
                    uuid: 'child-uuid',
                    id: 'child',
                    name: 'Child',
                    type: 'component',
                    description: '',
                    actors: [],
                    interfaces: [
                        {
                            uuid: 'child-iface-uuid',
                            id: 'API',
                            name: 'API',
                            type: 'rest',
                            parentInterfaceUuid: 'parent-iface-uuid',
                            functions: [],
                        },
                    ],
                    useCaseDiagrams: [
                        makeUseCaseDiagram(
                            'child-diagram',
                            'child-uuid',
                            makeUseCase('child-uc', childSequence)
                        ),
                    ],
                    subComponents: [],
                },
            ],
        }

        const lookup = buildFunctionReferenceLookup(root)

        expect(getInterfaceReferencedFunctionIds(lookup, 'child-iface-uuid')).toEqual(
            new Set(['doThing'])
        )
        expect(getFunctionTargetReferences(lookup, 'child-iface-uuid', 'doThing')).toEqual([
            { uuid: 'child-flow-uuid', name: 'child-flow' },
        ])
        expect(getFunctionTargetReferences(lookup, 'parent-iface-uuid', 'doThing')).toEqual([
            { uuid: 'parent-flow-uuid', name: 'parent-flow' },
        ])
    })

    it('resolves participant aliases when building the lookup', () => {
        const sequence = makeSequenceDiagram(
            'alias-flow',
            'root-uuid',
            ['actor user', 'component root as svc', 'user ->> svc: API:doThing()'].join('\n')
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
                    uuid: 'iface-uuid',
                    id: 'API',
                    name: 'API',
                    type: 'rest',
                    functions: [{ uuid: 'fn-uuid', id: 'doThing', parameters: [] }],
                },
            ],
            useCaseDiagrams: [makeUseCaseDiagram('diag', 'root-uuid', makeUseCase('uc', sequence))],
            subComponents: [],
        }

        const lookup = buildFunctionReferenceLookup(root)

        expect(getInterfaceReferencedFunctionIds(lookup, 'iface-uuid')).toEqual(
            new Set(['doThing'])
        )
        expect(getFunctionTargetReferences(lookup, 'iface-uuid', 'doThing')).toEqual([
            { uuid: 'alias-flow-uuid', name: 'alias-flow' },
        ])
    })
})
