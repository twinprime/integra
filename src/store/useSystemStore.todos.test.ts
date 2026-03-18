// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { getAggregatedNodeTodos } from '../utils/nodeTodos'
import type { ComponentNode, UseCaseDiagramNode } from './types'
import { useSystemStore } from './useSystemStore'

describe('useSystemStore TODO derivation', () => {
    beforeEach(() => {
        const { result } = renderHook(() => useSystemStore())
        act(() => {
            result.current.setSystem({
                uuid: 'root-component-uuid',
                id: 'root',
                name: 'My System',
                type: 'component',
                description: 'Root Component Node',
                subComponents: [],
                actors: [],
                useCaseDiagrams: [],
                interfaces: [],
            })
        })
    })

    it('updates derived TODOs after a description edit', () => {
        const { result } = renderHook(() => useSystemStore())

        act(() => {
            result.current.updateNode('root-component-uuid', {
                description: 'System notes <!-- TODO Review root backlog -->',
            })
        })

        expect(getAggregatedNodeTodos(result.current.rootComponent, 'root-component-uuid')).toEqual(
            [
                {
                    id: 'root-component-uuid:description:0:Review root backlog',
                    text: 'Review root backlog',
                    definingNodeUuid: 'root-component-uuid',
                    definingNodeName: 'My System',
                    source: 'description',
                },
            ]
        )
    })

    it('updates aggregated TODOs after a diagram edit', () => {
        const { result } = renderHook(() => useSystemStore())

        const component: ComponentNode = {
            uuid: 'comp-uuid',
            id: 'comp1',
            name: 'Component 1',
            type: 'component',
            description: 'Test Component',
            subComponents: [],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [],
        }

        act(() => {
            result.current.addNode('root-component-uuid', component)
        })

        const diagram: UseCaseDiagramNode = {
            uuid: 'diagram-uuid',
            id: 'diagram1',
            name: 'Use Case Diagram',
            type: 'use-case-diagram',
            description: 'Test Diagram',
            content: '',
            referencedNodeIds: [],
            ownerComponentUuid: 'comp-uuid',
            useCases: [],
        }

        act(() => {
            result.current.addNode('comp-uuid', diagram)
        })

        act(() => {
            result.current.updateNode('diagram-uuid', {
                content: '# TODO Review login flow\nactor user\nuse case login\nuser ->> login',
            })
        })

        expect(getAggregatedNodeTodos(result.current.rootComponent, 'comp-uuid')).toEqual([
            {
                id: 'diagram-uuid:diagram:0:Review login flow',
                text: 'Review login flow',
                definingNodeUuid: 'diagram-uuid',
                definingNodeName: 'Use Case Diagram',
                source: 'diagram',
            },
        ])
    })
})
