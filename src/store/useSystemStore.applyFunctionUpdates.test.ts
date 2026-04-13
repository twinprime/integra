// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSystemStore, type FunctionDecision } from './useSystemStore'
import type { ComponentNode } from './types'

// Mock crypto.randomUUID for consistent UUIDs in tests
const mockUUIDs = Array.from({ length: 8 }, (_, i) => `test-uuid-${i + 1}`)
let uuidIndex = 0

vi.stubGlobal('crypto', {
    randomUUID: () => mockUUIDs[uuidIndex++ % mockUUIDs.length],
})

describe('useSystemStore', () => {
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
})
