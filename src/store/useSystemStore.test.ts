// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSystemStore, type FunctionDecision } from './useSystemStore'
import type { ComponentNode, UseCaseDiagramNode } from './types'
import { sampleSystem, UUIDS } from '../../e2e/fixtures/sample-system'

// Mock crypto.randomUUID for consistent UUIDs in tests
const mockUUIDs = [
    'test-uuid-1',
    'test-uuid-2',
    'test-uuid-3',
    'test-uuid-4',
    'test-uuid-5',
    'test-uuid-6',
    'test-uuid-7',
    'test-uuid-8',
]
let uuidIndex = 0

vi.stubGlobal('crypto', {
    randomUUID: () => mockUUIDs[uuidIndex++ % mockUUIDs.length],
})

describe('useSystemStore', () => {
    beforeEach(() => {
        uuidIndex = 0
        // Reset store to initial state
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

    describe('parser integration note', () => {
        it('note: parser integration is tested in diagramParser.test.ts', () => {
            // The parsers (parseUseCaseDiagram, parseSequenceDiagram) are tested separately
            // in src/utils/diagramParser.test.ts with a node environment.
            // Those tests verify that referencedNodeIds are correctly populated.
            //
            // The store's setSystem and updateNode methods call these parsers,
            // but testing them end-to-end in a jsdom environment has issues with
            // module resolution or environment differences.
            //
            // Integration testing of save/load functionality is better done with E2E tests.
            expect(true).toBe(true)
        })
    })

    describe('initial state', () => {
        it('should have default initial system', () => {
            const { result } = renderHook(() => useSystemStore())
            expect(result.current.rootComponent.name).toBe('My System')
            expect(result.current.rootComponent.type).toBe('component')
            expect(result.current.selectedNodeId).toBeNull()
        })
    })

    describe('selectNode', () => {
        it('should select a node by uuid', () => {
            const { result } = renderHook(() => useSystemStore())

            act(() => {
                result.current.selectNode('test-node-uuid')
            })

            expect(result.current.selectedNodeId).toBe('test-node-uuid')
        })

        it('should deselect when passed null', () => {
            const { result } = renderHook(() => useSystemStore())

            act(() => {
                result.current.selectNode('test-node-uuid')
                result.current.selectNode(null)
            })

            expect(result.current.selectedNodeId).toBeNull()
        })

        it('should reset the active visualization view when selection changes', () => {
            const { result } = renderHook(() => useSystemStore())

            act(() => {
                result.current.selectVisualizationView('class-diagram')
                result.current.selectNode('test-node-uuid')
            })

            expect(result.current.selectedNodeId).toBe('test-node-uuid')
            expect(result.current.activeVisualizationViewId).toBeNull()
        })

        it('should clear parse errors when selection changes', () => {
            const { result } = renderHook(() => useSystemStore())

            act(() => {
                useSystemStore.setState({
                    selectedNodeId: null,
                    parseError: 'Unexpected token',
                })
                result.current.selectNode('test-node-uuid')
            })

            expect(useSystemStore.getState().selectedNodeId).toBe('test-node-uuid')
            expect(useSystemStore.getState().parseError).toBeNull()
        })

        it('should keep the active visualization view when selecting the same node again', () => {
            const { result } = renderHook(() => useSystemStore())

            act(() => {
                result.current.selectNode('test-node-uuid')
                result.current.selectVisualizationView('class-diagram')
                result.current.selectNode('test-node-uuid')
            })

            expect(result.current.activeVisualizationViewId).toBe('class-diagram')
        })
    })

    describe('addNode', () => {
        it('should add a component to the system', () => {
            const { result } = renderHook(() => useSystemStore())

            const newComponent: ComponentNode = {
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
                result.current.addNode('root-component-uuid', newComponent)
            })

            expect(result.current.rootComponent.subComponents).toHaveLength(1)
            expect(result.current.rootComponent.subComponents[0].name).toBe('Component 1')
        })

        it('should add an actor to a component', () => {
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

            const actor = {
                uuid: 'actor-uuid',
                id: 'actor1',
                name: 'User',
                type: 'actor' as const,
                description: 'Test Actor',
            }

            act(() => {
                result.current.addNode('comp-uuid', actor)
            })

            expect(result.current.rootComponent.subComponents[0].actors).toHaveLength(1)
            expect(result.current.rootComponent.subComponents[0].actors[0].name).toBe('User')
        })
    })

    describe('updateNode', () => {
        it('should update node name', () => {
            const { result } = renderHook(() => useSystemStore())

            act(() => {
                result.current.updateNode('root-component-uuid', {
                    name: 'Updated System',
                })
            })

            expect(result.current.rootComponent.name).toBe('Updated System')
        })

        it('should update node description', () => {
            const { result } = renderHook(() => useSystemStore())

            act(() => {
                result.current.updateNode('root-component-uuid', {
                    description: 'New description',
                })
            })

            expect(result.current.rootComponent.description).toBe('New description')
        })

        it('should update diagram content', () => {
            const { result } = renderHook(() => useSystemStore())

            // Add a component with a use case diagram
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
                type: 'use-case-diagram' as const,
                description: 'Test Diagram',
                content: '',
                referencedNodeIds: [],
                ownerComponentUuid: 'comp-uuid',
                useCases: [],
            }

            act(() => {
                result.current.addNode('comp-uuid', diagram)
            })

            // Update diagram content
            act(() => {
                result.current.updateNode('diagram-uuid', {
                    content: `actor user\nuse case login\nuser ->> login`,
                })
            })

            // Verify the content was updated
            const updatedComp = result.current.rootComponent.subComponents[0]
            const updatedDiagram = updatedComp.useCaseDiagrams[0]
            expect(updatedDiagram.content).toContain('user')
            expect(updatedDiagram.content).toContain('login')
        })
    })

    describe('deleteNode', () => {
        it('should delete a component from the system', () => {
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

            expect(result.current.rootComponent.subComponents).toHaveLength(1)

            act(() => {
                result.current.deleteNode('comp-uuid')
            })

            expect(result.current.rootComponent.subComponents).toHaveLength(0)
        })

        it('should delete an actor from a component', () => {
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

            const actor = {
                uuid: 'actor-uuid',
                id: 'actor1',
                name: 'User',
                type: 'actor' as const,
                description: 'Test Actor',
            }

            act(() => {
                result.current.addNode('comp-uuid', actor)
            })

            expect(result.current.rootComponent.subComponents[0].actors).toHaveLength(1)

            act(() => {
                result.current.deleteNode('actor-uuid')
            })

            expect(result.current.rootComponent.subComponents[0].actors).toHaveLength(0)
        })

        it('should clear selectedNodeId when deleting selected node', () => {
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
                result.current.selectNode('comp-uuid')
            })

            expect(result.current.selectedNodeId).toBe('comp-uuid')

            act(() => {
                result.current.deleteNode('comp-uuid')
            })

            expect(result.current.selectedNodeId).toBeNull()
        })
    })

    describe('setSystem', () => {
        it('should replace the entire system', () => {
            const { result } = renderHook(() => useSystemStore())

            const newSystem: ComponentNode = {
                uuid: 'new-system-uuid',
                id: 'new-system',
                name: 'New System',
                type: 'component',
                description: 'New System Description',
                subComponents: [],
                actors: [],
                useCaseDiagrams: [],
                interfaces: [],
            }

            act(() => {
                result.current.setSystem(newSystem)
            })

            expect(result.current.rootComponent.name).toBe('New System')
            expect(result.current.rootComponent.uuid).toBe('new-system-uuid')
        })

        it('should call parsers when loading system (integration with diagramParser)', () => {
            // NOTE: Full parser integration testing is challenging in jsdom environment.
            // The parsers are unit tested in diagramParser.test.ts with node environment.
            // This test verifies that setSystem at least accepts a system with diagrams
            // and doesn't crash. The actual parsing logic is tested separately.

            const { result } = renderHook(() => useSystemStore())

            const systemWithDiagrams: ComponentNode = {
                uuid: 'new-system-uuid',
                id: 'test-system',
                name: 'Test System',
                type: 'component',
                description: 'System with diagrams',
                subComponents: [
                    {
                        uuid: 'comp-uuid',
                        id: 'comp1',
                        name: 'Component 1',
                        type: 'component',
                        description: 'Component with diagrams',
                        subComponents: [],
                        actors: [],
                        useCaseDiagrams: [
                            {
                                uuid: 'uc-diagram-uuid',
                                id: 'ucdiagram1',
                                name: 'Use Case Diagram',
                                type: 'use-case-diagram' as const,
                                description: 'Test Use Case Diagram',
                                content: `actor user\nuse case login`,
                                referencedNodeIds: [],
                                ownerComponentUuid: 'comp-uuid',
                                useCases: [],
                            },
                        ],
                        interfaces: [],
                    },
                ],
                actors: [],
                useCaseDiagrams: [],
                interfaces: [],
            }

            act(() => {
                result.current.setSystem(systemWithDiagrams)
            })

            // Verify the system was loaded
            expect(result.current.rootComponent.name).toBe('Test System')
            expect(result.current.rootComponent.subComponents).toHaveLength(1)
            expect(result.current.rootComponent.subComponents[0].useCaseDiagrams).toHaveLength(1)
            // referencedNodeIds now stores UUIDs (assigned by crypto.randomUUID during parsing)
            expect(
                result.current.rootComponent.subComponents[0].useCaseDiagrams[0].referencedNodeIds
            ).toEqual(expect.arrayContaining([expect.stringMatching(/^test-uuid-\d+$/)]))
        })

        it('should not clear selectedNodeId when setting new system', () => {
            const { result } = renderHook(() => useSystemStore())

            act(() => {
                result.current.selectNode('some-node-uuid')
            })

            expect(result.current.selectedNodeId).toBe('some-node-uuid')

            const newSystem: ComponentNode = {
                uuid: 'new-system-uuid',
                id: 'new-system',
                name: 'New System',
                type: 'component',
                description: 'New System',
                subComponents: [],
                actors: [],
                useCaseDiagrams: [],
                interfaces: [],
            }

            act(() => {
                result.current.setSystem(newSystem)
            })

            // Note: setSystem does not automatically clear selectedNodeId
            // The caller (e.g., TreeView handleLoad) is responsible for clearing it if needed
            expect(result.current.selectedNodeId).toBe('some-node-uuid')
        })
        it('should allow updating function parameters in a sequence diagram when it is the only reference', () => {
            const { result } = renderHook(() => useSystemStore())

            // Build: root → comp → ucDiagram → useCase → seqDiagram
            const comp: ComponentNode = {
                uuid: 'comp-uuid',
                id: 'comp1',
                name: 'Comp',
                type: 'component',
                description: '',
                subComponents: [],
                actors: [],
                useCaseDiagrams: [],
                interfaces: [],
            }
            act(() => {
                result.current.addNode('root-component-uuid', comp)
            })

            act(() => {
                result.current.addNode('comp-uuid', {
                    uuid: 'uc-diag-uuid',
                    id: 'ucd1',
                    name: 'UC Diag',
                    type: 'use-case-diagram',
                    description: '',
                    content: '',
                    referencedNodeIds: [],
                    ownerComponentUuid: 'comp-uuid',
                    useCases: [],
                })
            })
            act(() => {
                result.current.addNode('uc-diag-uuid', {
                    uuid: 'uc-uuid',
                    id: 'uc1',
                    name: 'Use Case',
                    type: 'use-case',
                    description: '',
                    sequenceDiagrams: [],
                })
            })
            act(() => {
                result.current.addNode('uc-uuid', {
                    uuid: 'seq-uuid',
                    id: 'seq1',
                    name: 'Seq Diag',
                    type: 'sequence-diagram',
                    description: '',
                    content: '',
                    referencedNodeIds: [],
                    referencedFunctionUuids: [],
                    ownerComponentUuid: 'comp-uuid',
                })
            })

            // First parse: define fn(x: string)
            act(() => {
                result.current.updateNode('seq-uuid', {
                    content: `component comp\ncomp ->> comp: myInterface:doWork(x: string)`,
                })
            })
            expect(result.current.parseError).toBeNull()

            const fnBefore =
                result.current.rootComponent.subComponents[0].subComponents[0]?.interfaces[0]
                    ?.functions[0]
            expect(fnBefore).toBeDefined()
            expect(fnBefore.parameters).toHaveLength(1)
            expect(fnBefore.parameters[0].name).toBe('x')

            // Second parse: update same fn to fn(x: string, y: number) — should not error
            act(() => {
                result.current.updateNode('seq-uuid', {
                    content: `component comp\ncomp ->> comp: myInterface:doWork(x: string, y: number)`,
                })
            })
            expect(result.current.parseError).toBeNull()

            const fnAfter =
                result.current.rootComponent.subComponents[0].subComponents[0]?.interfaces[0]
                    ?.functions[0]
            expect(fnAfter).toBeDefined()
            expect(fnAfter.parameters).toHaveLength(2)
            expect(fnAfter.parameters[0].name).toBe('x')
            expect(fnAfter.parameters[1].name).toBe('y')
        })
    })

    describe('applyFunctionUpdates', () => {
        const FN_UUID = 'shared-fn-uuid'
        const CURRENT_DIAG = 'current-diag-uuid'
        const OTHER_DIAG = 'other-diag-uuid'
        const PARENT_FN_UUID = 'parent-fn-uuid'
        const CHILD_FN_UUID = 'child-fn-uuid'

        const buildSharedFunctionSystem = (): ComponentNode => ({
            uuid: 'root-component-uuid',
            id: 'root',
            name: 'My System',
            type: 'component',
            description: 'Root',
            subComponents: [
                {
                    uuid: 'comp-uuid',
                    id: 'comp1',
                    name: 'Comp',
                    type: 'component',
                    subComponents: [],
                    actors: [],
                    interfaces: [
                        {
                            uuid: 'api-iface-uuid',
                            id: 'API',
                            name: 'API',
                            type: 'rest',
                            functions: [
                                {
                                    uuid: FN_UUID,
                                    id: 'fn',
                                    parameters: [{ name: 'id', type: 'number', required: true }],
                                },
                            ],
                        },
                    ],
                    useCaseDiagrams: [
                        {
                            uuid: 'uc-diag-uuid',
                            id: 'ucd',
                            name: 'UC',
                            type: 'use-case-diagram',
                            content: '',
                            ownerComponentUuid: 'comp-uuid',
                            referencedNodeIds: [],
                            useCases: [
                                {
                                    uuid: 'uc-uuid',
                                    id: 'uc1',
                                    name: 'UC',
                                    type: 'use-case',
                                    sequenceDiagrams: [
                                        {
                                            uuid: CURRENT_DIAG,
                                            id: 'seq1',
                                            name: 'Current Diagram',
                                            type: 'sequence-diagram',
                                            content: '',
                                            ownerComponentUuid: 'comp-uuid',
                                            referencedNodeIds: [],
                                            referencedFunctionUuids: [FN_UUID],
                                        },
                                        {
                                            uuid: OTHER_DIAG,
                                            id: 'seq2',
                                            name: 'Other Diagram',
                                            type: 'sequence-diagram',
                                            content:
                                                'component a\ncomponent b\na ->> b: API:fn(id: number)',
                                            ownerComponentUuid: 'comp-uuid',
                                            referencedNodeIds: [],
                                            referencedFunctionUuids: [FN_UUID],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [],
        })

        const buildInheritedFunctionSystem = (): ComponentNode => ({
            uuid: 'root-component-uuid',
            id: 'root',
            name: 'My System',
            type: 'component',
            description: 'Root',
            subComponents: [
                {
                    uuid: 'child-comp-uuid',
                    id: 'child',
                    name: 'Child',
                    type: 'component',
                    subComponents: [],
                    actors: [],
                    interfaces: [
                        {
                            uuid: 'child-api-iface-uuid',
                            id: 'API',
                            name: 'API',
                            type: 'rest',
                            kind: 'inherited',
                            parentInterfaceUuid: 'parent-api-iface-uuid',
                            functions: [
                                {
                                    uuid: CHILD_FN_UUID,
                                    id: 'fn',
                                    parameters: [{ name: 'id', type: 'number', required: true }],
                                },
                            ],
                        },
                    ],
                    useCaseDiagrams: [
                        {
                            uuid: 'child-uc-diag-uuid',
                            id: 'childUcd',
                            name: 'Child UC',
                            type: 'use-case-diagram',
                            content: '',
                            ownerComponentUuid: 'child-comp-uuid',
                            referencedNodeIds: [],
                            useCases: [
                                {
                                    uuid: 'child-uc-uuid',
                                    id: 'childUseCase',
                                    name: 'Child Use Case',
                                    type: 'use-case',
                                    sequenceDiagrams: [
                                        {
                                            uuid: CURRENT_DIAG,
                                            id: 'seq1',
                                            name: 'Current Diagram',
                                            type: 'sequence-diagram',
                                            content:
                                                'component child\nchild ->> child: API:fn(id: number)',
                                            ownerComponentUuid: 'child-comp-uuid',
                                            referencedNodeIds: [],
                                            referencedFunctionUuids: [CHILD_FN_UUID],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [
                {
                    uuid: 'parent-api-iface-uuid',
                    id: 'API',
                    name: 'API',
                    type: 'rest',
                    kind: 'local',
                    functions: [
                        {
                            uuid: PARENT_FN_UUID,
                            id: 'fn',
                            parameters: [{ name: 'id', type: 'string', required: true }],
                        },
                    ],
                },
            ],
        })

        it('update-existing updates function params and text-substitutes in affected diagrams', () => {
            const { result } = renderHook(() => useSystemStore())

            act(() => {
                useSystemStore.setState({ rootComponent: buildSharedFunctionSystem() })
            })

            const decision: FunctionDecision = {
                kind: 'incompatible',
                action: 'update-existing',
                interfaceId: 'API',
                functionId: 'fn',
                functionUuid: FN_UUID,
                oldParams: [{ name: 'id', type: 'number', required: true }],
                newParams: [{ name: 'id', type: 'string', required: true }],
                affectedDiagramUuids: [OTHER_DIAG],
            }

            act(() => {
                result.current.applyFunctionUpdates(
                    [decision],
                    CURRENT_DIAG,
                    'component a\ncomponent b\na ->> b: API:fn(id: string)'
                )
            })

            const comp = result.current.rootComponent.subComponents[0]
            const fn = comp.interfaces[0].functions.find((f) => f.uuid === FN_UUID)
            expect(fn?.parameters[0].type).toBe('string')

            const otherDiag = comp.useCaseDiagrams[0].useCases[0].sequenceDiagrams.find(
                (d) => d.uuid === OTHER_DIAG
            )
            expect(otherDiag?.content).toContain('API:fn(id: string)')
            expect(otherDiag?.content).not.toContain('API:fn(id: number)')
            expect(result.current.parseError).toBeNull()
        })

        it("update-existing updates function params without touching other diagrams' content", () => {
            const { result } = renderHook(() => useSystemStore())

            act(() => {
                useSystemStore.setState({ rootComponent: buildSharedFunctionSystem() })
            })

            const decision: FunctionDecision = {
                kind: 'incompatible',
                action: 'update-existing',
                interfaceId: 'API',
                functionId: 'fn',
                functionUuid: FN_UUID,
                oldParams: [{ name: 'id', type: 'number', required: true }],
                newParams: [
                    { name: 'id', type: 'number', required: true },
                    { name: 'name', type: 'string', required: true },
                ],
                affectedDiagramUuids: [OTHER_DIAG],
            }

            act(() => {
                result.current.applyFunctionUpdates(
                    [decision],
                    CURRENT_DIAG,
                    'component a\ncomponent b\na ->> b: API:fn(id: number, name: string)'
                )
            })

            const comp = result.current.rootComponent.subComponents[0]
            const fn = comp.interfaces[0].functions.find((f) => f.uuid === FN_UUID)
            expect(fn?.parameters).toHaveLength(2)

            const otherDiag = comp.useCaseDiagrams[0].useCases[0].sequenceDiagrams.find(
                (d) => d.uuid === OTHER_DIAG
            )
            expect(otherDiag?.content).toContain('API:fn(id: number, name: string)')
            expect(result.current.parseError).toBeNull()
        })

        it('update-existing updates ALL messages in the current diagram that reference the same function', () => {
            // Regression test: when a diagram has multiple messages calling the same function and the
            // user edits only one of them, choosing "update-existing" must update the remaining
            // messages in the same diagram too.
            const { result } = renderHook(() => useSystemStore())

            act(() => {
                useSystemStore.setState({ rootComponent: buildSharedFunctionSystem() })
            })

            const decision: FunctionDecision = {
                kind: 'incompatible',
                action: 'update-existing',
                interfaceId: 'API',
                functionId: 'fn',
                functionUuid: FN_UUID,
                oldParams: [{ name: 'id', type: 'number', required: true }],
                newParams: [
                    { name: 'id', type: 'number', required: true },
                    { name: 'name', type: 'string', required: true },
                ],
                affectedDiagramUuids: [],
            }

            // The pendingContent has two messages: the user already updated the first one,
            // but the second still carries the old signature.
            const pendingContent = [
                'component a',
                'component b',
                'a ->> b: API:fn(id: number, name: string)',
                'b ->> a: API:fn(id: number)',
            ].join('\n')

            act(() => {
                result.current.applyFunctionUpdates([decision], CURRENT_DIAG, pendingContent)
            })

            const comp = result.current.rootComponent.subComponents[0]
            const currentDiag = comp.useCaseDiagrams[0].useCases[0].sequenceDiagrams.find(
                (d) => d.uuid === CURRENT_DIAG
            )
            // Both calls must use the new signature
            expect(currentDiag?.content).not.toContain('API:fn(id: number)')
            const matches = currentDiag?.content.match(/API:fn\([^)]*\)/g) ?? []
            expect(matches).toHaveLength(2)
            matches.forEach((m) => expect(m).toBe('API:fn(id: number, name: string)'))
        })

        it('update-existing preserves function and parameter descriptions after reparse', () => {
            // Regression test: the reparse step (tryReparseContent) strips functions that are
            // exclusively referenced by the current diagram and then re-creates them from the
            // DSL content. The re-created functions must carry over the descriptions from the
            // pre-strip version of the system.
            const { result } = renderHook(() => useSystemStore())

            // Build a system where FN_UUID is referenced ONLY by CURRENT_DIAG so that
            // stripExclusiveFunctionContributions will remove it, forcing re-creation during reparse.
            const soloSystem: ComponentNode = {
                uuid: 'root-component-uuid',
                id: 'root',
                name: 'My System',
                type: 'component',
                description: 'Root',
                subComponents: [
                    {
                        uuid: 'comp-uuid',
                        id: 'comp1',
                        name: 'Comp',
                        type: 'component',
                        subComponents: [],
                        actors: [],
                        interfaces: [
                            {
                                uuid: 'api-iface-uuid',
                                id: 'API',
                                name: 'API',
                                type: 'rest',
                                functions: [
                                    {
                                        uuid: FN_UUID,
                                        id: 'fn',
                                        description: 'The main function',
                                        parameters: [
                                            {
                                                name: 'id',
                                                type: 'number',
                                                required: true,
                                                description: 'The numeric ID',
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                        useCaseDiagrams: [
                            {
                                uuid: 'uc-diag-uuid',
                                id: 'ucd',
                                name: 'UC',
                                type: 'use-case-diagram',
                                content: '',
                                ownerComponentUuid: 'comp-uuid',
                                referencedNodeIds: [],
                                useCases: [
                                    {
                                        uuid: 'uc-uuid',
                                        id: 'uc1',
                                        name: 'UC',
                                        type: 'use-case',
                                        sequenceDiagrams: [
                                            {
                                                uuid: CURRENT_DIAG,
                                                id: 'seq1',
                                                name: 'Current Diagram',
                                                type: 'sequence-diagram',
                                                content:
                                                    'component client\ncomponent comp1\nclient ->> comp1: API:fn(id: number)',
                                                ownerComponentUuid: 'comp-uuid',
                                                referencedNodeIds: [],
                                                referencedFunctionUuids: [FN_UUID],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
                actors: [],
                useCaseDiagrams: [],
                interfaces: [],
            }

            act(() => {
                useSystemStore.setState({ rootComponent: soloSystem })
            })

            const decision: FunctionDecision = {
                kind: 'incompatible',
                action: 'update-existing',
                interfaceId: 'API',
                functionId: 'fn',
                functionUuid: FN_UUID,
                oldParams: [{ name: 'id', type: 'number', required: true }],
                newParams: [{ name: 'id', type: 'string', required: true }],
                affectedDiagramUuids: [],
            }

            act(() => {
                result.current.applyFunctionUpdates(
                    [decision],
                    CURRENT_DIAG,
                    'component client\ncomponent comp1\nclient ->> comp1: API:fn(id: string)'
                )
            })

            const comp = result.current.rootComponent.subComponents[0]
            const fn = comp.interfaces[0].functions.find((f) => f.id === 'fn')
            expect(fn?.description).toBe('The main function')
            expect(fn?.parameters[0].description).toBe('The numeric ID')
            expect(result.current.parseError).toBeNull()
        })

        it('remove-redundant removes a child-local inherited function and reparses to the parent function', () => {
            const { result } = renderHook(() => useSystemStore())

            act(() => {
                useSystemStore.setState({ rootComponent: buildInheritedFunctionSystem() })
            })

            const decision: FunctionDecision = {
                kind: 'redundant',
                action: 'remove-redundant',
                interfaceId: 'API',
                functionId: 'fn',
                functionUuid: CHILD_FN_UUID,
                oldParams: [{ name: 'id', type: 'number', required: true }],
                newParams: [{ name: 'id', type: 'string', required: true }],
                affectedDiagramUuids: [],
            }

            act(() => {
                result.current.applyFunctionUpdates(
                    [decision],
                    CURRENT_DIAG,
                    'component child\nchild ->> child: API:fn(id: string)'
                )
            })

            const child = result.current.rootComponent.subComponents[0]
            const inheritedIface = child.interfaces[0]
            expect(inheritedIface.functions).toEqual([])

            const currentDiag = child.useCaseDiagrams[0].useCases[0].sequenceDiagrams[0]
            expect(currentDiag.content).toContain('API:fn(id: string)')
            expect(currentDiag.referencedFunctionUuids).toEqual([PARENT_FN_UUID])
            expect(result.current.parseError).toBeNull()
        })

        it('update-existing removes conflicting child-local inherited functions when confirmed', () => {
            const { result } = renderHook(() => useSystemStore())

            act(() => {
                useSystemStore.setState({ rootComponent: buildInheritedFunctionSystem() })
            })

            const decision: FunctionDecision = {
                kind: 'incompatible',
                action: 'update-existing',
                interfaceId: 'API',
                functionId: 'fn',
                functionUuid: PARENT_FN_UUID,
                oldParams: [{ name: 'id', type: 'string', required: true }],
                newParams: [{ name: 'id', type: 'number', required: true }],
                affectedDiagramUuids: [],
                conflictingChildFunctions: [
                    {
                        componentUuid: 'child-comp-uuid',
                        componentName: 'Child',
                        interfaceUuid: 'child-api-iface-uuid',
                        interfaceId: 'API',
                        functionUuid: CHILD_FN_UUID,
                        functionId: 'fn',
                    },
                ],
            }

            act(() => {
                result.current.applyFunctionUpdates(
                    [decision],
                    CURRENT_DIAG,
                    'component child\nchild ->> child: API:fn(id: number)'
                )
            })

            const parentFn = result.current.rootComponent.interfaces[0].functions[0]
            expect(parentFn.parameters[0].type).toBe('number')

            const child = result.current.rootComponent.subComponents[0]
            expect(child.interfaces[0].functions).toEqual([])
            expect(
                child.useCaseDiagrams[0].useCases[0].sequenceDiagrams[0].referencedFunctionUuids
            ).toEqual([PARENT_FN_UUID])
            expect(result.current.parseError).toBeNull()
        })

        it('apply-parent-add adds the parent function, removes child-local function, and rebinds references', () => {
            const { result } = renderHook(() => useSystemStore())

            const CHILD_DIAG = 'child-diag-uuid'
            const CHILD_LOCAL_FN_UUID = 'child-local-fn-uuid'
            const PARENT_API_UUID = 'owner-api-iface-uuid'
            const CHILD_API_UUID = 'child-api-iface-uuid'

            // System: owner has API (no fn yet); child is a sub-component of owner and inherits
            // API, having a child-local fn(id: number). Sub-component structure ensures that
            // getParentInterfaceResolution can find owner's API as the parent interface for child's
            // inherited interface during the post-apply rebuild.
            const childComp: ComponentNode = {
                uuid: 'child-comp-uuid',
                id: 'child',
                name: 'Child',
                type: 'component',
                subComponents: [],
                actors: [],
                interfaces: [
                    {
                        uuid: CHILD_API_UUID,
                        id: 'API',
                        name: 'API',
                        type: 'rest',
                        kind: 'inherited',
                        parentInterfaceUuid: PARENT_API_UUID,
                        functions: [
                            {
                                uuid: CHILD_LOCAL_FN_UUID,
                                id: 'fn',
                                parameters: [{ name: 'id', type: 'number', required: true }],
                            },
                        ],
                    },
                ],
                useCaseDiagrams: [
                    {
                        uuid: 'child-uc-diag-uuid',
                        id: 'childUcd',
                        name: 'Child UC',
                        type: 'use-case-diagram',
                        content: '',
                        ownerComponentUuid: 'child-comp-uuid',
                        referencedNodeIds: [],
                        useCases: [
                            {
                                uuid: 'child-uc-uuid',
                                id: 'childUseCase',
                                name: 'Child Use Case',
                                type: 'use-case',
                                sequenceDiagrams: [
                                    {
                                        uuid: CHILD_DIAG,
                                        id: 'childSeq',
                                        name: 'Child Diagram',
                                        type: 'sequence-diagram',
                                        content:
                                            'component child\nchild ->> child: API:fn(id: number)',
                                        ownerComponentUuid: 'child-comp-uuid',
                                        referencedNodeIds: [],
                                        referencedFunctionUuids: [CHILD_LOCAL_FN_UUID],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }

            const parentAddSystem: ComponentNode = {
                uuid: 'root-component-uuid',
                id: 'root',
                name: 'My System',
                type: 'component',
                description: 'Root',
                subComponents: [
                    {
                        uuid: 'owner-comp-uuid',
                        id: 'owner',
                        name: 'Owner',
                        type: 'component',
                        subComponents: [childComp],
                        actors: [],
                        interfaces: [
                            {
                                uuid: PARENT_API_UUID,
                                id: 'API',
                                name: 'API',
                                type: 'rest',
                                kind: 'local',
                                functions: [], // no fn yet
                            },
                        ],
                        useCaseDiagrams: [
                            {
                                uuid: 'uc-diag-uuid',
                                id: 'ucd',
                                name: 'UC',
                                type: 'use-case-diagram',
                                content: '',
                                ownerComponentUuid: 'owner-comp-uuid',
                                referencedNodeIds: [],
                                useCases: [
                                    {
                                        uuid: 'uc-uuid',
                                        id: 'uc1',
                                        name: 'UC',
                                        type: 'use-case',
                                        sequenceDiagrams: [
                                            {
                                                uuid: CURRENT_DIAG,
                                                id: 'seq1',
                                                name: 'Current Diagram',
                                                type: 'sequence-diagram',
                                                content: '',
                                                ownerComponentUuid: 'owner-comp-uuid',
                                                referencedNodeIds: [],
                                                referencedFunctionUuids: [],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
                actors: [],
                useCaseDiagrams: [],
                interfaces: [],
            }

            act(() => {
                useSystemStore.setState({ rootComponent: parentAddSystem })
            })

            const decision: FunctionDecision = {
                kind: 'parent-add-conflict',
                action: 'apply-parent-add',
                parentComponentUuid: 'owner-comp-uuid',
                parentInterfaceUuid: PARENT_API_UUID,
                interfaceId: 'API',
                functionId: 'fn',
                newParams: [{ name: 'x', type: 'string', required: true }],
                conflictingChildFunctions: [
                    {
                        componentUuid: 'child-comp-uuid',
                        componentName: 'Child',
                        interfaceUuid: CHILD_API_UUID,
                        interfaceId: 'API',
                        functionUuid: CHILD_LOCAL_FN_UUID,
                        functionId: 'fn',
                    },
                ],
                affectedDiagramUuids: [CHILD_DIAG],
            }

            act(() => {
                result.current.applyFunctionUpdates(
                    [decision],
                    CURRENT_DIAG,
                    'component owner\nowner ->> owner: API:fn(x: string)'
                )
            })

            // owner is subComponents[0] of root; child is subComponents[0] of owner
            const owner = result.current.rootComponent.subComponents[0]
            const child = owner.subComponents[0]

            // Parent function is now added to owner's API
            const parentFns = owner.interfaces[0].functions
            expect(parentFns).toHaveLength(1)
            expect(parentFns[0].id).toBe('fn')
            expect(parentFns[0].parameters).toEqual([{ name: 'x', type: 'string', required: true }])

            // Child-local function is removed
            expect(child.interfaces[0].functions).toEqual([])

            // Child diagram content uses new signature
            const childDiag = child.useCaseDiagrams[0].useCases[0].sequenceDiagrams[0]
            expect(childDiag.content).toContain('API:fn(x: string)')
            expect(childDiag.content).not.toContain('API:fn(id: number)')

            // Child diagram references now resolve to the new parent function UUID
            expect(childDiag.referencedFunctionUuids).toEqual([parentFns[0].uuid])
            expect(result.current.parseError).toBeNull()
        })

        it('apply-parent-add rewrites all affected diagrams when there are multiple', () => {
            const { result } = renderHook(() => useSystemStore())

            const CHILD_DIAG_1 = 'child-diag-1-uuid'
            const CHILD_DIAG_2 = 'child-diag-2-uuid'
            const CHILD_LOCAL_FN_UUID = 'child-local-fn-uuid'
            const PARENT_API_UUID = 'owner-api-iface-uuid'
            const CHILD_API_UUID = 'child-api-iface-uuid'

            // child is a sub-component of owner so getParentInterfaceResolution finds owner's API
            const multiChildComp: ComponentNode = {
                uuid: 'child-comp-uuid',
                id: 'child',
                name: 'Child',
                type: 'component',
                subComponents: [],
                actors: [],
                interfaces: [
                    {
                        uuid: CHILD_API_UUID,
                        id: 'API',
                        name: 'API',
                        type: 'rest',
                        kind: 'inherited',
                        parentInterfaceUuid: PARENT_API_UUID,
                        functions: [
                            {
                                uuid: CHILD_LOCAL_FN_UUID,
                                id: 'fn',
                                parameters: [{ name: 'id', type: 'number', required: true }],
                            },
                        ],
                    },
                ],
                useCaseDiagrams: [
                    {
                        uuid: 'child-uc-diag-uuid',
                        id: 'childUcd',
                        name: 'Child UC',
                        type: 'use-case-diagram',
                        content: '',
                        ownerComponentUuid: 'child-comp-uuid',
                        referencedNodeIds: [],
                        useCases: [
                            {
                                uuid: 'child-uc-uuid',
                                id: 'childUseCase',
                                name: 'Child Use Case',
                                type: 'use-case',
                                sequenceDiagrams: [
                                    {
                                        uuid: CHILD_DIAG_1,
                                        id: 'childSeq1',
                                        name: 'Child Diagram 1',
                                        type: 'sequence-diagram',
                                        content:
                                            'component child\nchild ->> child: API:fn(id: number)',
                                        ownerComponentUuid: 'child-comp-uuid',
                                        referencedNodeIds: [],
                                        referencedFunctionUuids: [CHILD_LOCAL_FN_UUID],
                                    },
                                    {
                                        uuid: CHILD_DIAG_2,
                                        id: 'childSeq2',
                                        name: 'Child Diagram 2',
                                        type: 'sequence-diagram',
                                        content:
                                            'component child\nchild ->> child: API:fn(id: number)',
                                        ownerComponentUuid: 'child-comp-uuid',
                                        referencedNodeIds: [],
                                        referencedFunctionUuids: [CHILD_LOCAL_FN_UUID],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }

            const multiDiagSystem: ComponentNode = {
                uuid: 'root-component-uuid',
                id: 'root',
                name: 'My System',
                type: 'component',
                description: 'Root',
                subComponents: [
                    {
                        uuid: 'owner-comp-uuid',
                        id: 'owner',
                        name: 'Owner',
                        type: 'component',
                        subComponents: [multiChildComp],
                        actors: [],
                        interfaces: [
                            {
                                uuid: PARENT_API_UUID,
                                id: 'API',
                                name: 'API',
                                type: 'rest',
                                kind: 'local',
                                functions: [],
                            },
                        ],
                        useCaseDiagrams: [
                            {
                                uuid: 'uc-diag-uuid',
                                id: 'ucd',
                                name: 'UC',
                                type: 'use-case-diagram',
                                content: '',
                                ownerComponentUuid: 'owner-comp-uuid',
                                referencedNodeIds: [],
                                useCases: [
                                    {
                                        uuid: 'uc-uuid',
                                        id: 'uc1',
                                        name: 'UC',
                                        type: 'use-case',
                                        sequenceDiagrams: [
                                            {
                                                uuid: CURRENT_DIAG,
                                                id: 'seq1',
                                                name: 'Current Diagram',
                                                type: 'sequence-diagram',
                                                content: '',
                                                ownerComponentUuid: 'owner-comp-uuid',
                                                referencedNodeIds: [],
                                                referencedFunctionUuids: [],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
                actors: [],
                useCaseDiagrams: [],
                interfaces: [],
            }

            act(() => {
                useSystemStore.setState({ rootComponent: multiDiagSystem })
            })

            const decision: FunctionDecision = {
                kind: 'parent-add-conflict',
                action: 'apply-parent-add',
                parentComponentUuid: 'owner-comp-uuid',
                parentInterfaceUuid: PARENT_API_UUID,
                interfaceId: 'API',
                functionId: 'fn',
                newParams: [{ name: 'x', type: 'string', required: true }],
                conflictingChildFunctions: [
                    {
                        componentUuid: 'child-comp-uuid',
                        componentName: 'Child',
                        interfaceUuid: CHILD_API_UUID,
                        interfaceId: 'API',
                        functionUuid: CHILD_LOCAL_FN_UUID,
                        functionId: 'fn',
                    },
                ],
                affectedDiagramUuids: [CHILD_DIAG_1, CHILD_DIAG_2],
            }

            act(() => {
                result.current.applyFunctionUpdates(
                    [decision],
                    CURRENT_DIAG,
                    'component owner\nowner ->> owner: API:fn(x: string)'
                )
            })

            // owner is subComponents[0] of root; child is subComponents[0] of owner
            const owner = result.current.rootComponent.subComponents[0]
            const child = owner.subComponents[0]
            const seqDiags = child.useCaseDiagrams[0].useCases[0].sequenceDiagrams
            const parentFnUuid = owner.interfaces[0].functions[0].uuid

            // Both child diagrams are rewritten and rebound
            for (const d of seqDiags) {
                expect(d.content).toContain('API:fn(x: string)')
                expect(d.referencedFunctionUuids).toEqual([parentFnUuid])
            }
        })
    })

    describe('toggleUiMode', () => {
        it('toggles between browse and edit', () => {
            const { result } = renderHook(() => useSystemStore())
            act(() => result.current.setUiMode('browse'))
            act(() => result.current.toggleUiMode())
            expect(result.current.uiMode).toBe('edit')
            act(() => result.current.toggleUiMode())
            expect(result.current.uiMode).toBe('browse')
        })

        it('is a no-op when browseLocked is true', () => {
            const { result } = renderHook(() => useSystemStore())
            act(() => {
                result.current.setUiMode('browse')
                result.current.setBrowseLocked(true)
            })
            act(() => result.current.toggleUiMode())
            expect(result.current.uiMode).toBe('browse')
        })

        it('resumes toggling after browseLocked is cleared', () => {
            const { result } = renderHook(() => useSystemStore())
            act(() => {
                result.current.setUiMode('browse')
                result.current.setBrowseLocked(true)
            })
            act(() => result.current.toggleUiMode())
            expect(result.current.uiMode).toBe('browse')

            act(() => result.current.setBrowseLocked(false))
            act(() => result.current.toggleUiMode())
            expect(result.current.uiMode).toBe('edit')
        })
    })

    describe('renameNodeId', () => {
        it('supports sequential use-case and actor renames on the sample fixture', () => {
            const { result } = renderHook(() => useSystemStore())

            act(() => {
                useSystemStore.setState({
                    rootComponent: sampleSystem,
                    past: [],
                    future: [],
                    parseError: null,
                    selectedNodeId: null,
                })
            })

            act(() => {
                result.current.renameNodeId(UUIDS.uc, 'SignIn')
            })

            act(() => {
                result.current.renameNodeId(UUIDS.actor, 'Customer')
            })

            expect(result.current.rootComponent.useCaseDiagrams[0].content).toContain(
                'actor Customer'
            )
            expect(result.current.rootComponent.useCaseDiagrams[0].content).toContain(
                'use case SignIn'
            )
            expect(result.current.rootComponent.useCaseDiagrams[0].content).not.toContain(
                'actor User'
            )
        })
    })
})
