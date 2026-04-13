/**
 * Focused unit tests for src/parser/sequenceDiagram/systemUpdater.ts
 *
 * Each test exercises the "DSL content → component tree mutation" flow
 * by calling parseSequenceDiagram directly, inspecting the returned root.
 */
import { describe, it, expect } from 'vitest'
import { analyzeSequenceDiagramChanges, parseSequenceDiagram } from './systemUpdater'
import type { ComponentNode, SequenceDiagramNode } from '../../store/types'

// ─── UUIDs ────────────────────────────────────────────────────────────────────

const ROOT_UUID = 'root-uuid'
const OWNER_UUID = 'owner-uuid'
const AUTH_UUID = 'auth-uuid'
const UCD_UUID = 'ucd-uuid'
const UC_UUID = 'uc-uuid'
const SEQ_UUID = 'seq-uuid'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSeqDiag(overrides: Partial<SequenceDiagramNode> = {}): SequenceDiagramNode {
    return {
        uuid: SEQ_UUID,
        id: 'seq',
        name: 'Seq',
        type: 'sequence-diagram',
        content: '',
        ownerComponentUuid: OWNER_UUID,
        referencedNodeIds: [],
        referencedFunctionUuids: [],
        ...overrides,
    }
}

function makeOwner(overrides: Partial<ComponentNode> = {}): ComponentNode {
    return {
        uuid: OWNER_UUID,
        id: 'owner',
        name: 'Owner',
        type: 'component',
        description: '',
        subComponents: [],
        actors: [],
        interfaces: [],
        useCaseDiagrams: [
            {
                uuid: UCD_UUID,
                id: 'ucd',
                name: 'Use Cases',
                type: 'use-case-diagram',
                content: '',
                ownerComponentUuid: OWNER_UUID,
                referencedNodeIds: [],
                useCases: [
                    {
                        uuid: UC_UUID,
                        id: 'uc',
                        name: 'Use Case',
                        type: 'use-case',
                        description: '',
                        sequenceDiagrams: [makeSeqDiag()],
                    },
                ],
            },
        ],
        ...overrides,
    }
}

function makeRoot(
    ownerOverrides: Partial<ComponentNode> = {},
    extraSubs: ComponentNode[] = []
): ComponentNode {
    return {
        uuid: ROOT_UUID,
        id: 'root',
        name: 'Root',
        type: 'component',
        description: '',
        subComponents: [makeOwner(ownerOverrides), ...extraSubs],
        actors: [],
        interfaces: [],
        useCaseDiagrams: [],
    }
}

/** Pull the updated ownerComp from the returned root. */
function getOwner(root: ComponentNode): ComponentNode {
    return root.subComponents[0]
}

/** Pull the sequence diagram node from the returned root. */
function getSeqDiag(root: ComponentNode): SequenceDiagramNode {
    return getOwner(root).useCaseDiagrams[0].useCases[0].sequenceDiagrams[0]
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parseSequenceDiagram — participant declarations', () => {
    it('actor participant creates actor node under owner component', () => {
        const root = makeRoot()
        const result = parseSequenceDiagram('actor customer', root, OWNER_UUID, SEQ_UUID)
        const actors = getOwner(result).actors
        expect(actors).toHaveLength(1)
        expect(actors[0]).toMatchObject({ id: 'customer', type: 'actor' })
    })

    it('component participant creates sub-component under owner component', () => {
        const root = makeRoot()
        const result = parseSequenceDiagram('component orderSvc', root, OWNER_UUID, SEQ_UUID)
        const subComponents = getOwner(result).subComponents
        expect(subComponents).toHaveLength(1)
        expect(subComponents[0]).toMatchObject({ id: 'orderSvc', type: 'component' })
    })

    it('component participant with alias uses derived name, not alias', () => {
        const root = makeRoot()
        const result = parseSequenceDiagram(
            'component order_service as orders',
            root,
            OWNER_UUID,
            SEQ_UUID
        )
        const sub = getOwner(result).subComponents[0]
        expect(sub.id).toBe('order_service')
        expect(sub.name).toBe('Order Service')
    })
})

describe('parseSequenceDiagram — function call message', () => {
    it('function-ref message adds interface and function to receiver component', () => {
        const content = [
            'actor customer',
            'component orderSvc',
            'customer ->> orderSvc: OrdersAPI:placeOrder(orderId: string)',
        ].join('\n')
        const root = makeRoot()
        const result = parseSequenceDiagram(content, root, OWNER_UUID, SEQ_UUID)

        const orderSvc = getOwner(result).subComponents.find((c) => c.id === 'orderSvc')
        expect(orderSvc).toBeDefined()
        const iface = orderSvc!.interfaces.find((i) => i.id === 'OrdersAPI')
        expect(iface).toBeDefined()
        const fn = iface!.functions.find((f) => f.id === 'placeOrder')
        expect(fn).toBeDefined()
        expect(fn!.parameters).toEqual([{ name: 'orderId', type: 'string', required: true }])
    })

    it('referencedFunctionUuids is populated after a function-ref message', () => {
        const content = [
            'actor customer',
            'component orderSvc',
            'customer ->> orderSvc: OrdersAPI:placeOrder(orderId: string)',
        ].join('\n')
        const root = makeRoot()
        const result = parseSequenceDiagram(content, root, OWNER_UUID, SEQ_UUID)
        const seqDiag = getSeqDiag(result)

        expect(seqDiag.referencedFunctionUuids).toHaveLength(1)
        // UUID must be a valid non-empty string that was assigned during parsing
        expect(typeof seqDiag.referencedFunctionUuids[0]).toBe('string')
        expect(seqDiag.referencedFunctionUuids[0]).not.toBe('')
    })

    it('referencedFunctionUuids is populated when receiver is referenced by alias', () => {
        const content = [
            'actor customer',
            'component orderSvc as orders',
            'customer ->> orders: OrdersAPI:placeOrder(orderId: string)',
        ].join('\n')
        const root = makeRoot()
        const result = parseSequenceDiagram(content, root, OWNER_UUID, SEQ_UUID)
        const seqDiag = getSeqDiag(result)

        expect(seqDiag.referencedFunctionUuids).toHaveLength(1)
        expect(typeof seqDiag.referencedFunctionUuids[0]).toBe('string')
        expect(seqDiag.referencedFunctionUuids[0]).not.toBe('')
    })

    it('kafka interface type assigns function to sender, not receiver', () => {
        // Pre-seed receiver with a kafka interface so the type is known
        const receiverComp: ComponentNode = {
            uuid: 'receiver-uuid',
            id: 'receiver',
            name: 'Receiver',
            type: 'component',
            description: '',
            subComponents: [],
            actors: [],
            interfaces: [
                {
                    uuid: 'kafka-iface-uuid',
                    id: 'KafkaAPI',
                    name: 'KafkaAPI',
                    type: 'kafka',
                    functions: [],
                },
            ],
            useCaseDiagrams: [],
        }
        const root = makeRoot({ subComponents: [receiverComp] })
        const content = [
            'component sender',
            'component receiver',
            'sender ->> receiver: KafkaAPI:publish(msg: string)',
        ].join('\n')
        const result = parseSequenceDiagram(content, root, OWNER_UUID, SEQ_UUID)

        const owner = getOwner(result)
        const sender = owner.subComponents.find((c) => c.id === 'sender')
        const receiver = owner.subComponents.find((c) => c.id === 'receiver')

        expect(sender).toBeDefined()
        expect(receiver).toBeDefined()
        const senderFn = sender!.interfaces
            .find((i) => i.id === 'KafkaAPI')
            ?.functions.find((f) => f.id === 'publish')
        expect(senderFn).toBeDefined()
        // Receiver should NOT have gained the publish function
        const receiverFn = receiver!.interfaces
            .find((i) => i.id === 'KafkaAPI')
            ?.functions.find((f) => f.id === 'publish')
        expect(receiverFn).toBeUndefined()
    })
})

describe('analyzeSequenceDiagramChanges', () => {
    it('reports inherited parent signature changes when edited through an inherited child interface', () => {
        const CURRENT_DIAG_UUID = 'current-seq-uuid'
        const OTHER_DIAG_UUID = 'other-seq-uuid'
        const PARENT_FN_UUID = 'parent-fn-uuid'
        const CHILD_FN_UUID = 'child-fn-uuid'
        const childComponent: ComponentNode = {
            uuid: 'child-uuid',
            id: 'child',
            name: 'Child',
            type: 'component',
            description: '',
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
                    uuid: 'child-ucd-uuid',
                    id: 'childUcd',
                    name: 'Child Use Cases',
                    type: 'use-case-diagram',
                    content: '',
                    ownerComponentUuid: 'child-uuid',
                    referencedNodeIds: [],
                    useCases: [
                        {
                            uuid: 'child-uc-uuid',
                            id: 'childUseCase',
                            name: 'Child Use Case',
                            type: 'use-case',
                            description: '',
                            sequenceDiagrams: [
                                {
                                    uuid: CURRENT_DIAG_UUID,
                                    id: 'currentSeq',
                                    name: 'Current Diagram',
                                    type: 'sequence-diagram',
                                    content: 'component child\nchild ->> child: API:fn(id: string)',
                                    ownerComponentUuid: 'child-uuid',
                                    referencedNodeIds: [],
                                    referencedFunctionUuids: [PARENT_FN_UUID],
                                },
                                {
                                    uuid: OTHER_DIAG_UUID,
                                    id: 'otherSeq',
                                    name: 'Other Diagram',
                                    type: 'sequence-diagram',
                                    content: 'component child\nchild ->> child: API:fn(id: string)',
                                    ownerComponentUuid: 'child-uuid',
                                    referencedNodeIds: [],
                                    referencedFunctionUuids: [PARENT_FN_UUID],
                                },
                            ],
                        },
                    ],
                },
            ],
        }
        const root: ComponentNode = {
            uuid: ROOT_UUID,
            id: 'root',
            name: 'Root',
            type: 'component',
            description: '',
            subComponents: [childComponent],
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
        }
        const content = ['component child', 'child ->> child: API:fn(id: number)'].join('\n')

        expect(
            analyzeSequenceDiagramChanges(content, root, CURRENT_DIAG_UUID, [
                {
                    uuid: CURRENT_DIAG_UUID,
                    referencedFunctionUuids: [PARENT_FN_UUID],
                },
                {
                    uuid: OTHER_DIAG_UUID,
                    referencedFunctionUuids: [PARENT_FN_UUID],
                },
            ])
        ).toEqual([
            {
                kind: 'incompatible',
                interfaceId: 'API',
                functionId: 'fn',
                functionUuid: PARENT_FN_UUID,
                oldParams: [{ name: 'id', type: 'string', required: true }],
                newParams: [{ name: 'id', type: 'number', required: true }],
                affectedDiagramUuids: [OTHER_DIAG_UUID],
                conflictingChildFunctions: [
                    {
                        componentUuid: 'child-uuid',
                        componentName: 'Child',
                        interfaceUuid: 'child-api-iface-uuid',
                        interfaceId: 'API',
                        functionUuid: CHILD_FN_UUID,
                        functionId: 'fn',
                    },
                ],
            },
        ])
    })

    it('detects parent-add conflict when function would be added to a parent interface where a child already has it with a different signature', () => {
        const CURRENT_DIAG_UUID = 'parent-diag-uuid'
        const CHILD_FN_UUID = 'child-fn-uuid'
        const PARENT_API_UUID = 'parent-api-uuid'
        const CHILD_API_UUID = 'child-api-uuid'
        const CHILD_DIAG_UUID = 'child-diag-uuid'

        const childComponent: ComponentNode = {
            uuid: 'child-uuid',
            id: 'child',
            name: 'Child',
            type: 'component',
            description: '',
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
                            uuid: CHILD_FN_UUID,
                            id: 'fn',
                            parameters: [{ name: 'id', type: 'number', required: true }],
                        },
                    ],
                },
            ],
            useCaseDiagrams: [],
        }

        // Owner has API with no 'fn' yet. Child is a sub-component of owner so that
        // getParentInterfaceResolution can find owner's API as the parent interface.
        // resolveFunctionReferenceTarget will find fn recursively on child, but
        // fnIsDirectlyOnTarget will be false (componentUuid mismatch) → parent-add detection runs.
        const ownerWithDiag: ComponentNode = {
            uuid: OWNER_UUID,
            id: 'owner',
            name: 'Owner',
            type: 'component',
            description: '',
            subComponents: [childComponent],
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
                    uuid: UCD_UUID,
                    id: 'ucd',
                    name: 'Use Cases',
                    type: 'use-case-diagram',
                    content: '',
                    ownerComponentUuid: OWNER_UUID,
                    referencedNodeIds: [],
                    useCases: [
                        {
                            uuid: UC_UUID,
                            id: 'uc',
                            name: 'Use Case',
                            type: 'use-case',
                            description: '',
                            sequenceDiagrams: [
                                makeSeqDiag({
                                    uuid: CURRENT_DIAG_UUID,
                                    ownerComponentUuid: OWNER_UUID,
                                    referencedFunctionUuids: [],
                                }),
                            ],
                        },
                    ],
                },
            ],
        }

        const root: ComponentNode = {
            uuid: ROOT_UUID,
            id: 'root',
            name: 'Root',
            type: 'component',
            description: '',
            subComponents: [ownerWithDiag],
            actors: [],
            interfaces: [],
            useCaseDiagrams: [],
        }

        // Diagram tries to add fn(x: string) to owner's API — but child already has fn(id: number)
        const content = 'component owner\nowner ->> owner: API:fn(x: string)'

        expect(
            analyzeSequenceDiagramChanges(content, root, CURRENT_DIAG_UUID, [
                { uuid: CURRENT_DIAG_UUID, referencedFunctionUuids: [] },
                { uuid: CHILD_DIAG_UUID, referencedFunctionUuids: [CHILD_FN_UUID] },
            ])
        ).toEqual([
            {
                kind: 'parent-add-conflict',
                parentComponentUuid: OWNER_UUID,
                parentInterfaceUuid: PARENT_API_UUID,
                interfaceId: 'API',
                functionId: 'fn',
                newParams: [{ name: 'x', type: 'string', required: true }],
                conflictingChildFunctions: [
                    {
                        componentUuid: 'child-uuid',
                        componentName: 'Child',
                        interfaceUuid: CHILD_API_UUID,
                        interfaceId: 'API',
                        functionUuid: CHILD_FN_UUID,
                        functionId: 'fn',
                    },
                ],
                affectedDiagramUuids: [CHILD_DIAG_UUID],
            },
        ])
    })

    it('does not emit parent-add-conflict when child signature matches the new parent signature', () => {
        const CURRENT_DIAG_UUID = 'parent-diag-uuid'
        const CHILD_FN_UUID = 'child-fn-uuid'
        const PARENT_API_UUID = 'parent-api-uuid'
        const CHILD_API_UUID = 'child-api-uuid'

        const childComponent: ComponentNode = {
            uuid: 'child-uuid',
            id: 'child',
            name: 'Child',
            type: 'component',
            description: '',
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
                    // Same signature as what we're about to add — no parent-add conflict
                    functions: [
                        {
                            uuid: CHILD_FN_UUID,
                            id: 'fn',
                            parameters: [{ name: 'x', type: 'string', required: true }],
                        },
                    ],
                },
            ],
            useCaseDiagrams: [],
        }

        const ownerWithDiag: ComponentNode = {
            uuid: OWNER_UUID,
            id: 'owner',
            name: 'Owner',
            type: 'component',
            description: '',
            subComponents: [childComponent],
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
                    uuid: UCD_UUID,
                    id: 'ucd',
                    name: 'Use Cases',
                    type: 'use-case-diagram',
                    content: '',
                    ownerComponentUuid: OWNER_UUID,
                    referencedNodeIds: [],
                    useCases: [
                        {
                            uuid: UC_UUID,
                            id: 'uc',
                            name: 'Use Case',
                            type: 'use-case',
                            description: '',
                            sequenceDiagrams: [
                                makeSeqDiag({
                                    uuid: CURRENT_DIAG_UUID,
                                    ownerComponentUuid: OWNER_UUID,
                                    referencedFunctionUuids: [],
                                }),
                            ],
                        },
                    ],
                },
            ],
        }

        const root: ComponentNode = {
            uuid: ROOT_UUID,
            id: 'root',
            name: 'Root',
            type: 'component',
            description: '',
            subComponents: [ownerWithDiag],
            actors: [],
            interfaces: [],
            useCaseDiagrams: [],
        }

        const content = 'component owner\nowner ->> owner: API:fn(x: string)'

        // Child has same signature as what we're adding — no conflict (handled by redundant flow)
        expect(
            analyzeSequenceDiagramChanges(content, root, CURRENT_DIAG_UUID, [
                { uuid: CURRENT_DIAG_UUID, referencedFunctionUuids: [] },
            ])
        ).toEqual([])
    })
})

describe('parseSequenceDiagram — cross-component path references', () => {
    it('multi-segment path reference adds target UUID to referencedNodeIds', () => {
        const authSvc: ComponentNode = {
            uuid: AUTH_UUID,
            id: 'auth',
            name: 'Auth',
            type: 'component',
            description: '',
            subComponents: [],
            actors: [],
            interfaces: [],
            useCaseDiagrams: [],
        }
        // owner is a direct child of root; auth is another direct child of root
        const root = makeRoot({}, [authSvc])
        const result = parseSequenceDiagram(
            'component root/auth as auth',
            root,
            OWNER_UUID,
            SEQ_UUID
        )

        const seqDiag = getSeqDiag(result)
        expect(seqDiag.referencedNodeIds).toContain(AUTH_UUID)
    })

    it('unknown path triggers auto-creation and adds new UUID to referencedNodeIds', () => {
        const root = makeRoot()
        const result = parseSequenceDiagram('component root/newSvc', root, OWNER_UUID, SEQ_UUID)

        // The new sub-component should appear on root
        const newSvc = result.subComponents.find((c) => c.id === 'newSvc')
        expect(newSvc).toBeDefined()
        const seqDiag = getSeqDiag(result)
        expect(seqDiag.referencedNodeIds).toContain(newSvc!.uuid)
    })
})

describe('parseSequenceDiagram — self-reference', () => {
    it('declaring owner component as participant does not create a duplicate child', () => {
        // Owner has id="owner"; declaring `component owner` should be treated as self-reference
        const root = makeRoot()
        const result = parseSequenceDiagram('component owner', root, OWNER_UUID, SEQ_UUID)

        const owner = getOwner(result)
        // No child with id="owner" should be added
        expect(owner.subComponents.every((c) => c.id !== 'owner')).toBe(true)
    })

    it('self-referenced owner UUID appears in referencedNodeIds', () => {
        const root = makeRoot()
        const result = parseSequenceDiagram('component owner', root, OWNER_UUID, SEQ_UUID)

        const seqDiag = getSeqDiag(result)
        expect(seqDiag.referencedNodeIds).toContain(OWNER_UUID)
    })
})

describe('parseSequenceDiagram — idempotency', () => {
    it('applying same content twice does not duplicate actors', () => {
        const content = 'actor customer'
        const root = makeRoot()
        const after1 = parseSequenceDiagram(content, root, OWNER_UUID, SEQ_UUID)
        const after2 = parseSequenceDiagram(content, after1, OWNER_UUID, SEQ_UUID)

        expect(getOwner(after2).actors.filter((a) => a.id === 'customer')).toHaveLength(1)
    })

    it('applying same content twice does not duplicate sub-components', () => {
        const content = 'component orderSvc'
        const root = makeRoot()
        const after1 = parseSequenceDiagram(content, root, OWNER_UUID, SEQ_UUID)
        const after2 = parseSequenceDiagram(content, after1, OWNER_UUID, SEQ_UUID)

        expect(getOwner(after2).subComponents.filter((c) => c.id === 'orderSvc')).toHaveLength(1)
    })

    it('applying same function-ref message twice does not duplicate interface functions', () => {
        const content = [
            'actor customer',
            'component orderSvc',
            'customer ->> orderSvc: OrdersAPI:placeOrder(orderId: string)',
        ].join('\n')
        const root = makeRoot()
        const after1 = parseSequenceDiagram(content, root, OWNER_UUID, SEQ_UUID)
        const after2 = parseSequenceDiagram(content, after1, OWNER_UUID, SEQ_UUID)

        const iface = getOwner(after2)
            .subComponents.find((c) => c.id === 'orderSvc')!
            .interfaces.find((i) => i.id === 'OrdersAPI')
        expect(iface!.functions.filter((f) => f.id === 'placeOrder')).toHaveLength(1)
    })

    it('allows a child local interface to add a same-id function even when a parent interface already has it', () => {
        const child: ComponentNode = {
            uuid: 'child-uuid',
            id: 'orderSvc',
            name: 'orderSvc',
            type: 'component',
            description: '',
            subComponents: [],
            actors: [],
            interfaces: [
                {
                    uuid: 'child-iface-uuid',
                    id: 'OrdersAPI',
                    name: 'OrdersAPI',
                    type: 'rest',
                    functions: [],
                },
            ],
            useCaseDiagrams: [],
        }
        const root = makeRoot({
            interfaces: [
                {
                    uuid: 'parent-iface-uuid',
                    id: 'OrdersAPI',
                    name: 'OrdersAPI',
                    type: 'rest',
                    functions: [
                        {
                            uuid: 'parent-fn-uuid',
                            id: 'placeOrder',
                            parameters: [{ name: 'id', type: 'string', required: true }],
                        },
                    ],
                },
            ],
            subComponents: [child],
        })
        const content = [
            'actor customer',
            'component orderSvc',
            'customer ->> orderSvc: OrdersAPI:placeOrder(orderId: number)',
        ].join('\n')

        const result = parseSequenceDiagram(content, root, OWNER_UUID, SEQ_UUID)
        const updatedChild = getOwner(result).subComponents.find((c) => c.id === 'orderSvc')
        const childFn = updatedChild?.interfaces
            .find((iface) => iface.id === 'OrdersAPI')
            ?.functions.find((fn) => fn.id === 'placeOrder')
        const parentFn = getOwner(result).interfaces[0].functions[0]

        expect(childFn?.parameters).toEqual([{ name: 'orderId', type: 'number', required: true }])
        expect(parentFn.parameters).toEqual([{ name: 'id', type: 'string', required: true }])
    })

    it('creates a child-local interface when only the parent owns that interface id', () => {
        const child: ComponentNode = {
            uuid: 'child-uuid',
            id: 'orderSvc',
            name: 'orderSvc',
            type: 'component',
            description: '',
            subComponents: [],
            actors: [],
            interfaces: [],
            useCaseDiagrams: [],
        }
        const root = makeRoot({
            interfaces: [
                {
                    uuid: 'parent-iface-uuid',
                    id: 'OrdersAPI',
                    name: 'OrdersAPI',
                    type: 'rest',
                    functions: [{ uuid: 'parent-fn-uuid', id: 'placeOrder', parameters: [] }],
                },
            ],
            subComponents: [child],
        })
        const content = [
            'actor customer',
            'component orderSvc',
            'customer ->> orderSvc: OrdersAPI:placeOrder(orderId: number)',
        ].join('\n')

        const result = parseSequenceDiagram(content, root, OWNER_UUID, SEQ_UUID)
        const updatedChild = getOwner(result).subComponents.find((c) => c.id === 'orderSvc')
        const childInterface = updatedChild?.interfaces.find((iface) => iface.id === 'OrdersAPI')
        const childFn = childInterface?.functions.find((fn) => fn.id === 'placeOrder')

        expect(childInterface).toBeDefined()
        expect(childFn?.parameters).toEqual([{ name: 'orderId', type: 'number', required: true }])
        expect(getOwner(result).interfaces[0].functions[0].parameters).toEqual([])
    })

    it('does not report a parent-signature conflict when the child receiver is referenced through an alias', () => {
        const child: ComponentNode = {
            uuid: 'child-uuid',
            id: 'orderSvc',
            name: 'orderSvc',
            type: 'component',
            description: '',
            subComponents: [],
            actors: [],
            interfaces: [
                {
                    uuid: 'child-iface-uuid',
                    id: 'OrdersAPI',
                    name: 'OrdersAPI',
                    type: 'rest',
                    functions: [],
                },
            ],
            useCaseDiagrams: [],
        }
        const root = makeRoot({
            interfaces: [
                {
                    uuid: 'parent-iface-uuid',
                    id: 'OrdersAPI',
                    name: 'OrdersAPI',
                    type: 'rest',
                    functions: [
                        {
                            uuid: 'parent-fn-uuid',
                            id: 'placeOrder',
                            parameters: [{ name: 'id', type: 'string', required: true }],
                        },
                    ],
                },
            ],
            subComponents: [child],
        })
        const content = [
            'actor customer',
            'component orderSvc as orders',
            'customer ->> orders: OrdersAPI:placeOrder(orderId: number)',
        ].join('\n')

        expect(analyzeSequenceDiagramChanges(content, root, SEQ_UUID, [])).toEqual([])
    })

    it('does not report a parent-signature conflict when the child receiver has no local interface yet', () => {
        const child: ComponentNode = {
            uuid: 'child-uuid',
            id: 'orderSvc',
            name: 'orderSvc',
            type: 'component',
            description: '',
            subComponents: [],
            actors: [],
            interfaces: [],
            useCaseDiagrams: [],
        }
        const root = makeRoot({
            interfaces: [
                {
                    uuid: 'parent-iface-uuid',
                    id: 'OrdersAPI',
                    name: 'OrdersAPI',
                    type: 'rest',
                    functions: [
                        {
                            uuid: 'parent-fn-uuid',
                            id: 'placeOrder',
                            parameters: [{ name: 'id', type: 'string', required: true }],
                        },
                    ],
                },
            ],
            subComponents: [child],
        })
        const content = [
            'actor customer',
            'component orderSvc',
            'customer ->> orderSvc: OrdersAPI:placeOrder(orderId: number)',
        ].join('\n')

        expect(analyzeSequenceDiagramChanges(content, root, SEQ_UUID, [])).toEqual([])
    })
})

describe('parseSequenceDiagram — empty / whitespace content', () => {
    it('empty content returns root unchanged', () => {
        const root = makeRoot()
        const result = parseSequenceDiagram('', root, OWNER_UUID, SEQ_UUID)
        expect(result).toBe(root)
    })

    it('whitespace-only content returns root unchanged', () => {
        const root = makeRoot()
        const result = parseSequenceDiagram('   \n  ', root, OWNER_UUID, SEQ_UUID)
        expect(result).toBe(root)
    })
})
