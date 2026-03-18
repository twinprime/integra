import { describe, expect, it } from 'vitest'
import type { ComponentNode } from '../store/types'
import { applyIdRename } from './renameNodeId'
import { sampleSystem, UUIDS } from '../../e2e/fixtures/sample-system'

const makeAncestorChildTree = (): ComponentNode => ({
    uuid: 'root-ancestor',
    id: 'root',
    name: 'Root',
    type: 'component',
    description: 'See [Root Order](placeOrder)',
    actors: [],
    interfaces: [],
    useCaseDiagrams: [
        {
            uuid: 'ucd-root',
            id: 'rootDiag',
            name: 'Root Diag',
            type: 'use-case-diagram',
            description: '',
            content: 'use case placeOrder',
            referencedNodeIds: [],
            ownerComponentUuid: 'root-ancestor',
            useCases: [
                {
                    uuid: 'uc-root',
                    id: 'placeOrder',
                    name: 'Root Place Order',
                    type: 'use-case',
                    description: '',
                    sequenceDiagrams: [],
                },
            ],
        },
    ],
    subComponents: [
        {
            uuid: 'child-comp',
            id: 'child',
            name: 'Child',
            type: 'component',
            description: 'Local [Order](placeOrder) and parent [Order](root/placeOrder)',
            actors: [],
            interfaces: [],
            useCaseDiagrams: [
                {
                    uuid: 'ucd-child',
                    id: 'childDiag',
                    name: 'Child Diag',
                    type: 'use-case-diagram',
                    description: '',
                    content: 'use case placeOrder',
                    referencedNodeIds: [],
                    ownerComponentUuid: 'child-comp',
                    useCases: [
                        {
                            uuid: 'uc-child',
                            id: 'placeOrder',
                            name: 'Child Place Order',
                            type: 'use-case',
                            description: '',
                            sequenceDiagrams: [
                                {
                                    uuid: 'sd-child',
                                    id: 'childFlow',
                                    name: 'Child Flow',
                                    type: 'sequence-diagram',
                                    description: '',
                                    content:
                                        'actor customer\ncustomer ->> api: UseCase:placeOrder\ncustomer ->> api: UseCase:root/placeOrder',
                                    referencedNodeIds: [],
                                    referencedFunctionUuids: [],
                                    ownerComponentUuid: 'child-comp',
                                },
                            ],
                        },
                    ],
                },
            ],
            subComponents: [],
        },
    ],
})

const makeFunctionScopeTree = (): ComponentNode => ({
    uuid: 'root-fn',
    id: 'root',
    name: 'Root',
    type: 'component',
    description: '',
    actors: [],
    interfaces: [],
    useCaseDiagrams: [],
    subComponents: [
        {
            uuid: 'alpha-comp',
            id: 'alpha',
            name: 'Alpha',
            type: 'component',
            description: '',
            actors: [],
            interfaces: [],
            useCaseDiagrams: [
                {
                    uuid: 'alpha-ucd',
                    id: 'alphaDiag',
                    name: 'Alpha Diag',
                    type: 'use-case-diagram',
                    description: '',
                    content: '',
                    referencedNodeIds: [],
                    ownerComponentUuid: 'alpha-comp',
                    useCases: [
                        {
                            uuid: 'alpha-uc',
                            id: 'checkout',
                            name: 'Checkout',
                            type: 'use-case',
                            description: '',
                            sequenceDiagrams: [
                                {
                                    uuid: 'alpha-sd',
                                    id: 'alphaFlow',
                                    name: 'Alpha Flow',
                                    type: 'sequence-diagram',
                                    description: '',
                                    content:
                                        'component alphaApi\nuser ->> alphaApi: OrdersAPI:placeOrder(item: string)',
                                    referencedNodeIds: [],
                                    referencedFunctionUuids: [],
                                    ownerComponentUuid: 'alpha-comp',
                                },
                            ],
                        },
                    ],
                },
            ],
            subComponents: [
                {
                    uuid: 'alpha-api-comp',
                    id: 'alphaApi',
                    name: 'Alpha API',
                    type: 'component',
                    description: '',
                    actors: [],
                    useCaseDiagrams: [],
                    subComponents: [],
                    interfaces: [
                        {
                            uuid: 'iface-alpha',
                            id: 'OrdersAPI',
                            name: 'Orders API',
                            type: 'rest',
                            description: '',
                            functions: [
                                {
                                    uuid: 'fn-alpha',
                                    id: 'placeOrder',
                                    description: '',
                                    parameters: [],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            uuid: 'beta-comp',
            id: 'beta',
            name: 'Beta',
            type: 'component',
            description: '',
            actors: [],
            interfaces: [],
            useCaseDiagrams: [
                {
                    uuid: 'beta-ucd',
                    id: 'betaDiag',
                    name: 'Beta Diag',
                    type: 'use-case-diagram',
                    description: '',
                    content: '',
                    referencedNodeIds: [],
                    ownerComponentUuid: 'beta-comp',
                    useCases: [
                        {
                            uuid: 'beta-uc',
                            id: 'checkout',
                            name: 'Checkout',
                            type: 'use-case',
                            description: '',
                            sequenceDiagrams: [
                                {
                                    uuid: 'beta-sd',
                                    id: 'betaFlow',
                                    name: 'Beta Flow',
                                    type: 'sequence-diagram',
                                    description: '',
                                    content:
                                        'component betaApi\nuser ->> betaApi: OrdersAPI:placeOrder(item: string)',
                                    referencedNodeIds: [],
                                    referencedFunctionUuids: [],
                                    ownerComponentUuid: 'beta-comp',
                                },
                            ],
                        },
                    ],
                },
            ],
            subComponents: [
                {
                    uuid: 'beta-api-comp',
                    id: 'betaApi',
                    name: 'Beta API',
                    type: 'component',
                    description: '',
                    actors: [],
                    useCaseDiagrams: [],
                    subComponents: [],
                    interfaces: [
                        {
                            uuid: 'iface-beta',
                            id: 'OrdersAPI',
                            name: 'Orders API',
                            type: 'rest',
                            description: '',
                            functions: [
                                {
                                    uuid: 'fn-beta',
                                    id: 'placeOrder',
                                    description: '',
                                    parameters: [],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ],
})

const makeSiblingPathTree = (): ComponentNode => ({
    uuid: 'root-sibling',
    id: 'root',
    name: 'Root',
    type: 'component',
    description: '',
    actors: [],
    interfaces: [],
    useCaseDiagrams: [],
    subComponents: [
        {
            uuid: 'alpha-sibling',
            id: 'alpha',
            name: 'Alpha',
            type: 'component',
            description: '',
            actors: [],
            interfaces: [],
            useCaseDiagrams: [
                {
                    uuid: 'alpha-sibling-ucd',
                    id: 'alphaDiag',
                    name: 'Alpha Diag',
                    type: 'use-case-diagram',
                    description: '',
                    content: 'use case placeOrder',
                    referencedNodeIds: [],
                    ownerComponentUuid: 'alpha-sibling',
                    useCases: [
                        {
                            uuid: 'alpha-sibling-uc',
                            id: 'placeOrder',
                            name: 'Alpha Place Order',
                            type: 'use-case',
                            description: '',
                            sequenceDiagrams: [
                                {
                                    uuid: 'alpha-sibling-sd',
                                    id: 'alphaFlow',
                                    name: 'Alpha Flow',
                                    type: 'sequence-diagram',
                                    description: '',
                                    content:
                                        'actor customer\ncustomer ->> api: UseCase:placeOrder\ncustomer ->> api: UseCase:root/beta/placeOrder',
                                    referencedNodeIds: [],
                                    referencedFunctionUuids: [],
                                    ownerComponentUuid: 'alpha-sibling',
                                },
                            ],
                        },
                    ],
                },
            ],
            subComponents: [],
        },
        {
            uuid: 'beta-sibling',
            id: 'beta',
            name: 'Beta',
            type: 'component',
            description: '',
            actors: [],
            interfaces: [],
            useCaseDiagrams: [
                {
                    uuid: 'beta-sibling-ucd',
                    id: 'betaDiag',
                    name: 'Beta Diag',
                    type: 'use-case-diagram',
                    description: '',
                    content: 'use case placeOrder',
                    referencedNodeIds: [],
                    ownerComponentUuid: 'beta-sibling',
                    useCases: [
                        {
                            uuid: 'beta-sibling-uc',
                            id: 'placeOrder',
                            name: 'Beta Place Order',
                            type: 'use-case',
                            description: '',
                            sequenceDiagrams: [],
                        },
                    ],
                },
            ],
            subComponents: [],
        },
    ],
})

describe('applyIdRename — extended scope regressions', () => {
    it('does not update ancestor-local references when renaming a child node with the same id', () => {
        const updated = applyIdRename(
            makeAncestorChildTree(),
            'uc-child',
            'placeOrder',
            'createOrder'
        )

        expect(updated.description).toBe('See [Root Order](placeOrder)')
        expect(updated.useCaseDiagrams[0].content).toContain('use case placeOrder')
        expect(updated.subComponents[0].description).toContain('[Order](createOrder)')
    })

    it('keeps child-local references unchanged while updating explicit parent paths', () => {
        const updated = applyIdRename(
            makeAncestorChildTree(),
            'uc-root',
            'placeOrder',
            'createOrder'
        )
        const childSequence =
            updated.subComponents[0].useCaseDiagrams[0].useCases[0].sequenceDiagrams[0].content

        expect(childSequence).toContain('UseCase:placeOrder')
        expect(childSequence).toContain('UseCase:root/createOrder')
    })

    it('keeps child-local markdown links unchanged while updating explicit parent paths', () => {
        const updated = applyIdRename(
            makeAncestorChildTree(),
            'uc-root',
            'placeOrder',
            'createOrder'
        )

        expect(updated.subComponents[0].description).toBe(
            'Local [Order](placeOrder) and parent [Order](root/createOrder)'
        )
    })

    it('does not update same-id function references in a sibling component', () => {
        const updated = applyIdRename(
            makeFunctionScopeTree(),
            'fn-alpha',
            'placeOrder',
            'createOrder'
        )
        const alphaContent =
            updated.subComponents[0].useCaseDiagrams[0].useCases[0].sequenceDiagrams[0].content
        const betaContent =
            updated.subComponents[1].useCaseDiagrams[0].useCases[0].sequenceDiagrams[0].content

        expect(alphaContent).toContain('OrdersAPI:createOrder')
        expect(betaContent).toContain('OrdersAPI:placeOrder')
    })

    it('updates only explicit sibling paths that resolve to the renamed target', () => {
        const updated = applyIdRename(
            makeSiblingPathTree(),
            'beta-sibling-uc',
            'placeOrder',
            'createOrder'
        )
        const alphaContent =
            updated.subComponents[0].useCaseDiagrams[0].useCases[0].sequenceDiagrams[0].content

        expect(alphaContent).toContain('UseCase:placeOrder')
        expect(alphaContent).toContain('UseCase:root/beta/createOrder')
    })

    it('supports sequential use-case and actor renames on the sample fixture', () => {
        const renamedUseCase = applyIdRename(sampleSystem, UUIDS.uc, 'Login', 'SignIn')
        const renamedActor = applyIdRename(renamedUseCase, UUIDS.actor, 'User', 'Customer')

        expect(renamedActor.useCaseDiagrams[0].content).toContain('actor Customer')
        expect(renamedActor.useCaseDiagrams[0].content).toContain('use case SignIn')
    })
})
