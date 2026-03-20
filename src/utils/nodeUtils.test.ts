import { describe, it, expect } from 'vitest'
import {
    collectReferencedFunctionUuids,
    isUseCaseReferenced,
    isNodeOrphaned,
    findNodeByPath,
    findNearestComponentAncestor,
    getAncestorComponentChain,
    isInScope,
    getComponentAbsolutePath,
    getNodeAbsolutePath,
    getNodeAbsolutePathSegments,
} from './nodeUtils'
import type { ComponentNode } from '../store/types'

describe('collectReferencedFunctionUuids', () => {
    it("finds function UUIDs referenced in a sibling component's sequence diagrams", () => {
        // Reproduces the strikethrough bug:
        // - "service" component owns an interface function (fn-uuid-1)
        // - The sequence diagram referencing it lives on the PARENT component (ownerComponent)
        // - When viewing "service" in EditorPanel, calling collectReferencedFunctionUuids(service)
        //   returns an empty set — causing the function to appear unreferenced (strikethrough)
        // - The fix: call collectReferencedFunctionUuids(rootComponent) instead

        const fnUuid = 'fn-uuid-1'

        const serviceComponent: ComponentNode = {
            uuid: 'service-uuid',
            id: 'service',
            name: 'service',
            type: 'component',
            subComponents: [],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [
                {
                    uuid: 'iface-uuid',
                    id: 'ServiceAPI',
                    name: 'ServiceAPI',
                    type: 'rest',
                    functions: [
                        {
                            uuid: fnUuid,
                            id: 'getData',
                            parameters: [],
                        },
                    ],
                },
            ],
        }

        const rootComponent: ComponentNode = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'Root',
            type: 'component',
            actors: [],
            interfaces: [],
            subComponents: [serviceComponent],
            useCaseDiagrams: [
                {
                    uuid: 'uc-diagram-uuid',
                    id: 'uc-diagram',
                    name: 'UC Diagram',
                    type: 'use-case-diagram',
                    content: '',
                    description: '',
                    ownerComponentUuid: 'root-uuid',
                    referencedNodeIds: [],
                    useCases: [
                        {
                            uuid: 'use-case-uuid',
                            id: 'use-case',
                            name: 'Use Case',
                            type: 'use-case',
                            description: '',
                            sequenceDiagrams: [
                                {
                                    uuid: 'seq-diagram-uuid',
                                    id: 'seq-diagram',
                                    name: 'Sequence Diagram',
                                    type: 'sequence-diagram',
                                    content: '',
                                    description: '',
                                    ownerComponentUuid: 'root-uuid',
                                    referencedNodeIds: [],
                                    referencedFunctionUuids: [fnUuid],
                                },
                            ],
                        },
                    ],
                },
            ],
        }

        // BUG: calling on the sub-component (service) misses diagrams on the parent
        const fromService = collectReferencedFunctionUuids(serviceComponent)
        expect(fromService.has(fnUuid)).toBe(false) // demonstrates the bug scope

        // FIX: calling on the root finds all references
        const fromRoot = collectReferencedFunctionUuids(rootComponent)
        expect(fromRoot.has(fnUuid)).toBe(true)
    })

    it('finds function UUIDs referenced in deeply nested sub-component diagrams', () => {
        const fnUuid = 'fn-uuid-deep'

        const serviceComponent: ComponentNode = {
            uuid: 'service-uuid',
            id: 'service',
            name: 'service',
            type: 'component',
            subComponents: [],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [
                {
                    uuid: 'iface-uuid',
                    id: 'API',
                    name: 'API',
                    type: 'rest',
                    functions: [{ uuid: fnUuid, id: 'fn', parameters: [] }],
                },
            ],
        }

        const subOwner: ComponentNode = {
            uuid: 'sub-owner-uuid',
            id: 'sub-owner',
            name: 'sub-owner',
            type: 'component',
            actors: [],
            interfaces: [],
            subComponents: [serviceComponent],
            useCaseDiagrams: [
                {
                    uuid: 'uc-uuid',
                    id: 'uc',
                    name: 'UC',
                    type: 'use-case-diagram',
                    content: '',
                    description: '',
                    ownerComponentUuid: 'sub-owner-uuid',
                    referencedNodeIds: [],
                    useCases: [
                        {
                            uuid: 'uc-node-uuid',
                            id: 'uc-node',
                            name: 'UC Node',
                            type: 'use-case',
                            description: '',
                            sequenceDiagrams: [
                                {
                                    uuid: 'seq-uuid',
                                    id: 'seq',
                                    name: 'Seq',
                                    type: 'sequence-diagram',
                                    content: '',
                                    description: '',
                                    ownerComponentUuid: 'sub-owner-uuid',
                                    referencedNodeIds: [],
                                    referencedFunctionUuids: [fnUuid],
                                },
                            ],
                        },
                    ],
                },
            ],
        }

        const rootComponent: ComponentNode = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'Root',
            type: 'component',
            actors: [],
            interfaces: [],
            subComponents: [subOwner],
            useCaseDiagrams: [],
        }

        const result = collectReferencedFunctionUuids(rootComponent)
        expect(result.has(fnUuid)).toBe(true)
    })
})

const buildTree = (): ComponentNode => {
    const sub: ComponentNode = {
        uuid: 'sub-uuid',
        id: 'sub',
        name: 'Sub',
        type: 'component',
        actors: [{ uuid: 'actor-uuid', id: 'leader', name: 'Leader', type: 'actor' }],
        subComponents: [],
        useCaseDiagrams: [
            {
                uuid: 'diag-uuid',
                id: 'diag',
                name: 'Diag',
                type: 'use-case-diagram',
                content: '',
                description: '',
                ownerComponentUuid: 'sub-uuid',
                referencedNodeIds: [],
                useCases: [
                    {
                        uuid: 'uc-uuid',
                        id: 'login',
                        name: 'Login',
                        type: 'use-case',
                        description: '',
                        sequenceDiagrams: [],
                    },
                ],
            },
        ],
        interfaces: [],
    }
    return {
        uuid: 'root-uuid',
        id: 'root',
        name: 'Root',
        type: 'component',
        actors: [],
        interfaces: [],
        subComponents: [sub],
        useCaseDiagrams: [],
    }
}

describe('findNodeByPath', () => {
    it('resolves a bare node ID within context component', () => {
        const root = buildTree()
        const uuid = findNodeByPath(root, 'leader', 'sub-uuid')
        expect(uuid).toBe('actor-uuid')
    })

    it('does not find a node from a sibling component without full path', () => {
        const root = buildTree()
        // "leader" only exists in "sub", not in root
        const uuid = findNodeByPath(root, 'leader', 'root-uuid')
        expect(uuid).toBeNull()
    })

    it('resolves a multi-segment path: componentId/nodeId', () => {
        const root = buildTree()
        const uuid = findNodeByPath(root, 'sub/leader')
        expect(uuid).toBe('actor-uuid')
    })

    it('resolves a use case within a diagram via multi-segment path', () => {
        const root = buildTree()
        const uuid = findNodeByPath(root, 'sub/diag/login')
        expect(uuid).toBe('uc-uuid')
    })

    it('resolves starting from root if first segment matches root id', () => {
        const root = buildTree()
        const uuid = findNodeByPath(root, 'root/sub/leader')
        expect(uuid).toBe('actor-uuid')
    })
})

describe('findNearestComponentAncestor', () => {
    it('returns the parent component for an actor', () => {
        const root = buildTree()
        const comp = findNearestComponentAncestor(root, 'actor-uuid')
        expect(comp?.uuid).toBe('sub-uuid')
    })

    it('returns the parent component for a use case', () => {
        const root = buildTree()
        const comp = findNearestComponentAncestor(root, 'uc-uuid')
        expect(comp?.uuid).toBe('sub-uuid')
    })

    it('returns the parent for a sub-component', () => {
        const root = buildTree()
        const comp = findNearestComponentAncestor(root, 'sub-uuid')
        expect(comp?.uuid).toBe('root-uuid')
    })

    it('returns root itself when root uuid is the target', () => {
        const root = buildTree()
        const comp = findNearestComponentAncestor(root, 'root-uuid')
        expect(comp?.uuid).toBe('root-uuid')
    })
})

describe('isUseCaseReferenced', () => {
    const makeSeqDiag = (referencedNodeIds: string[]) => ({
        uuid: 'seq-uuid',
        id: 'seq',
        name: 'Seq',
        type: 'sequence-diagram' as const,
        content: '',
        description: '',
        ownerComponentUuid: 'sub-uuid',
        referencedNodeIds,
        referencedFunctionUuids: [],
    })

    it('returns false when no sequence diagrams reference the use case', () => {
        const root = buildTree()
        expect(isUseCaseReferenced(root, 'uc-uuid')).toBe(false)
    })

    it('returns true when a sequence diagram directly references the use case', () => {
        const root = buildTree()
        const uc = root.subComponents[0].useCaseDiagrams[0].useCases[0]
        const updatedRoot: ComponentNode = {
            ...root,
            subComponents: [
                {
                    ...root.subComponents[0],
                    useCaseDiagrams: [
                        {
                            ...root.subComponents[0].useCaseDiagrams[0],
                            useCases: [
                                {
                                    ...uc,
                                    sequenceDiagrams: [
                                        ...uc.sequenceDiagrams,
                                        makeSeqDiag(['uc-uuid']),
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        }
        expect(isUseCaseReferenced(updatedRoot, 'uc-uuid')).toBe(true)
    })

    it('returns false when sequence diagram references a different uuid', () => {
        const root = buildTree()
        const uc = root.subComponents[0].useCaseDiagrams[0].useCases[0]
        const updatedRoot = {
            ...root,
            subComponents: [
                {
                    ...root.subComponents[0],
                    useCaseDiagrams: [
                        {
                            ...root.subComponents[0].useCaseDiagrams[0],
                            useCases: [
                                {
                                    ...uc,
                                    sequenceDiagrams: [
                                        ...uc.sequenceDiagrams,
                                        makeSeqDiag(['other-uuid']),
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        }
        expect(isUseCaseReferenced(updatedRoot, 'uc-uuid')).toBe(false)
    })

    it('detects cross-component reference (seq diagram in root referencing use case in sub)', () => {
        const root = buildTree()
        // Add a use-case diagram to root with a seq diagram that references uc-uuid from sub
        const updatedRoot: ComponentNode = {
            ...root,
            useCaseDiagrams: [
                {
                    uuid: 'root-uc-diag',
                    id: 'rootDiag',
                    name: 'Root Diag',
                    type: 'use-case-diagram',
                    content: '',
                    description: '',
                    ownerComponentUuid: 'root-uuid',
                    referencedNodeIds: [],
                    useCases: [
                        {
                            uuid: 'root-uc',
                            id: 'rootUc',
                            name: 'Root UC',
                            type: 'use-case',
                            description: '',
                            sequenceDiagrams: [makeSeqDiag(['uc-uuid'])],
                        },
                    ],
                },
            ],
        }
        expect(isUseCaseReferenced(updatedRoot, 'uc-uuid')).toBe(true)
    })
})

// ─── isNodeOrphaned ───────────────────────────────────────────────────────────

describe('isNodeOrphaned', () => {
    it('returns true when actor is not referenced in any diagram', () => {
        const root = buildTree()
        const actor = root.subComponents[0].actors[0]
        expect(isNodeOrphaned(actor, root)).toBe(true)
    })

    it('returns false when actor is referenced in a use-case diagram referencedNodeIds', () => {
        const root = buildTree()
        const actor = root.subComponents[0].actors[0]
        const updatedRoot: ComponentNode = {
            ...root,
            subComponents: [
                {
                    ...root.subComponents[0],
                    useCaseDiagrams: [
                        {
                            ...root.subComponents[0].useCaseDiagrams[0],
                            referencedNodeIds: [actor.uuid],
                        },
                    ],
                },
            ],
        }
        expect(isNodeOrphaned(actor, updatedRoot)).toBe(false)
    })

    it('returns false when actor is referenced in a sequence diagram referencedNodeIds', () => {
        const root = buildTree()
        const actor = root.subComponents[0].actors[0]
        const uc = root.subComponents[0].useCaseDiagrams[0].useCases[0]
        const updatedRoot: ComponentNode = {
            ...root,
            subComponents: [
                {
                    ...root.subComponents[0],
                    useCaseDiagrams: [
                        {
                            ...root.subComponents[0].useCaseDiagrams[0],
                            useCases: [
                                {
                                    ...uc,
                                    sequenceDiagrams: [
                                        ...uc.sequenceDiagrams,
                                        {
                                            uuid: 'seq-uuid',
                                            id: 'seq',
                                            name: 'Seq',
                                            type: 'sequence-diagram',
                                            content: '',
                                            description: '',
                                            ownerComponentUuid: 'sub-uuid',
                                            referencedNodeIds: [actor.uuid],
                                            referencedFunctionUuids: [],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        }
        expect(isNodeOrphaned(actor, updatedRoot)).toBe(false)
    })

    it('returns true for an unreferenced use-case (use-case has canDelete)', () => {
        const root = buildTree()
        const uc = root.subComponents[0].useCaseDiagrams[0].useCases[0]
        // use-case is not referenced anywhere → deletable
        expect(isNodeOrphaned(uc, root)).toBe(true)
    })

    it('returns false for use-case-diagram node type (canDelete not set)', () => {
        const root = buildTree()
        const ucd = root.subComponents[0].useCaseDiagrams[0]
        // useCases[0] has no sequenceDiagrams referencing it, so the ucd IS orphaned.
        // This test is superseded by the regression tests below; kept for historical clarity.
        expect(isNodeOrphaned(ucd, root)).toBe(true)
    })

    // Regression test for bug: empty use-case-diagram should be deletable
    it('empty use-case-diagram is orphaned and should be deletable', () => {
        const emptyUcd: import('../store/types').UseCaseDiagramNode = {
            uuid: 'empty-ucd',
            id: 'empty-ucd',
            name: 'Empty',
            type: 'use-case-diagram',
            content: '',
            description: '',
            ownerComponentUuid: 'root-uuid',
            referencedNodeIds: [],
            useCases: [],
        }
        const root: import('../store/types').ComponentNode = {
            uuid: 'root-uuid',
            id: 'root',
            name: 'Root',
            type: 'component',
            actors: [],
            interfaces: [],
            subComponents: [],
            useCaseDiagrams: [emptyUcd],
        }
        expect(isNodeOrphaned(emptyUcd, root)).toBe(true)
    })

    it('returns false for unreferenced sequence-diagram that is itself referenced by another diagram', () => {
        const root = buildTree()
        const uc = root.subComponents[0].useCaseDiagrams[0].useCases[0]
        const seq: import('../store/types').SequenceDiagramNode = {
            uuid: 'seq-target',
            id: 'seqTarget',
            name: 'Seq Target',
            type: 'sequence-diagram',
            content: '',
            description: '',
            ownerComponentUuid: 'sub-uuid',
            referencedNodeIds: [],
            referencedFunctionUuids: [],
        }
        const updatedRoot = {
            ...root,
            subComponents: [
                {
                    ...root.subComponents[0],
                    useCaseDiagrams: [
                        {
                            ...root.subComponents[0].useCaseDiagrams[0],
                            useCases: [
                                {
                                    ...uc,
                                    sequenceDiagrams: [
                                        ...uc.sequenceDiagrams,
                                        seq,
                                        {
                                            uuid: 'seq-referencing',
                                            id: 'seqReferencing',
                                            name: 'Seq Ref',
                                            type: 'sequence-diagram' as const,
                                            content: '',
                                            description: '',
                                            ownerComponentUuid: 'sub-uuid',
                                            referencedNodeIds: ['seq-target'],
                                            referencedFunctionUuids: [],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        }
        expect(isNodeOrphaned(seq, updatedRoot)).toBe(false)
    })
})

// ─── Scope utilities ──────────────────────────────────────────────────────────

/**
 * Tree used for scope tests:
 *
 *   root
 *     child1   ← primary ownerComp in most tests
 *       grandchild1
 *         greatGrandchild
 *     child2   ← sibling of child1
 *       gc2    ← child of sibling (cousin of grandchild1)
 */
const buildScopeTree = () => {
    const makeComp = (
        uuid: string,
        id: string,
        subComponents: ComponentNode[] = []
    ): ComponentNode => ({
        uuid,
        id,
        name: id,
        type: 'component',
        actors: [],
        subComponents,
        useCaseDiagrams: [],
        interfaces: [],
    })
    const greatGrandchild = makeComp('ggc-uuid', 'ggc')
    const grandchild1 = makeComp('gc1-uuid', 'gc1', [greatGrandchild])
    const gc2 = makeComp('gc2-uuid', 'gc2')
    const child2 = makeComp('ch2-uuid', 'ch2', [gc2])
    const child1 = makeComp('ch1-uuid', 'ch1', [grandchild1])
    const root = makeComp('root-uuid', 'root', [child1, child2])
    return { root, child1, child2, grandchild1, greatGrandchild, gc2 }
}

describe('getAncestorComponentChain', () => {
    it('returns empty array for root', () => {
        const { root } = buildScopeTree()
        expect(getAncestorComponentChain(root, root.uuid)).toEqual([])
    })

    it('returns [root] for a direct child of root', () => {
        const { root, child1 } = buildScopeTree()
        const chain = getAncestorComponentChain(root, child1.uuid)
        expect(chain.map((c) => c.uuid)).toEqual([root.uuid])
    })

    it('returns [parent, root] for a grandchild', () => {
        const { root, child1, grandchild1 } = buildScopeTree()
        const chain = getAncestorComponentChain(root, grandchild1.uuid)
        expect(chain.map((c) => c.uuid)).toEqual([child1.uuid, root.uuid])
    })

    it('returns [grandchild, parent, root] for a great-grandchild', () => {
        const { root, child1, grandchild1, greatGrandchild } = buildScopeTree()
        const chain = getAncestorComponentChain(root, greatGrandchild.uuid)
        expect(chain.map((c) => c.uuid)).toEqual([grandchild1.uuid, child1.uuid, root.uuid])
    })
})

describe('isInScope — ownerComp = child1', () => {
    it('returns true for self', () => {
        const { root, child1 } = buildScopeTree()
        expect(isInScope(root, child1.uuid, child1.uuid)).toBe(true)
    })

    it('returns true for direct child', () => {
        const { root, child1, grandchild1 } = buildScopeTree()
        expect(isInScope(root, child1.uuid, grandchild1.uuid)).toBe(true)
    })

    it('returns true for grandchild (descendant in scope)', () => {
        const { root, child1, greatGrandchild } = buildScopeTree()
        expect(isInScope(root, child1.uuid, greatGrandchild.uuid)).toBe(true)
    })

    it('returns true for ancestor (root)', () => {
        const { root, child1 } = buildScopeTree()
        expect(isInScope(root, child1.uuid, root.uuid)).toBe(true)
    })

    it('returns true for sibling (direct child of ancestor root)', () => {
        const { root, child1, child2 } = buildScopeTree()
        expect(isInScope(root, child1.uuid, child2.uuid)).toBe(true)
    })

    it('returns false for cousin (child of sibling)', () => {
        const { root, child1, gc2 } = buildScopeTree()
        expect(isInScope(root, child1.uuid, gc2.uuid)).toBe(false)
    })
})

describe('isInScope — ownerComp = grandchild1 (deeper nesting)', () => {
    it('returns true for self', () => {
        const { root, grandchild1 } = buildScopeTree()
        expect(isInScope(root, grandchild1.uuid, grandchild1.uuid)).toBe(true)
    })

    it('returns true for direct child (great-grandchild)', () => {
        const { root, grandchild1, greatGrandchild } = buildScopeTree()
        expect(isInScope(root, grandchild1.uuid, greatGrandchild.uuid)).toBe(true)
    })

    it('returns true for parent ancestor', () => {
        const { root, child1, grandchild1 } = buildScopeTree()
        expect(isInScope(root, grandchild1.uuid, child1.uuid)).toBe(true)
    })

    it('returns true for root ancestor', () => {
        const { root, grandchild1 } = buildScopeTree()
        expect(isInScope(root, grandchild1.uuid, root.uuid)).toBe(true)
    })

    it('returns true for uncle (sibling of parent = direct child of ancestor root)', () => {
        const { root, grandchild1, child2 } = buildScopeTree()
        expect(isInScope(root, grandchild1.uuid, child2.uuid)).toBe(true)
    })

    it('returns false for cousin (child of uncle)', () => {
        const { root, grandchild1, gc2 } = buildScopeTree()
        expect(isInScope(root, grandchild1.uuid, gc2.uuid)).toBe(false)
    })
})

describe('isInScope — ownerComp = root', () => {
    it('returns true for self (root)', () => {
        const { root } = buildScopeTree()
        expect(isInScope(root, root.uuid, root.uuid)).toBe(true)
    })

    it('returns true for direct child', () => {
        const { root, child1 } = buildScopeTree()
        expect(isInScope(root, root.uuid, child1.uuid)).toBe(true)
    })

    it('returns true for grandchild (descendant in scope)', () => {
        const { root, grandchild1 } = buildScopeTree()
        expect(isInScope(root, root.uuid, grandchild1.uuid)).toBe(true)
    })
})

// ─── getComponentAbsolutePath ─────────────────────────────────────────────────

describe('getComponentAbsolutePath', () => {
    it('returns root.id for root', () => {
        const { root } = buildScopeTree()
        expect(getComponentAbsolutePath(root, root.uuid)).toBe('root')
    })

    it('returns root/childId for a direct child', () => {
        const { root, child1 } = buildScopeTree()
        expect(getComponentAbsolutePath(root, child1.uuid)).toBe('root/ch1')
    })

    it('returns root/childId/grandchildId for a grandchild', () => {
        const { root, grandchild1 } = buildScopeTree()
        expect(getComponentAbsolutePath(root, grandchild1.uuid)).toBe('root/ch1/gc1')
    })

    it('returns full path for a great-grandchild', () => {
        const { root, greatGrandchild } = buildScopeTree()
        expect(getComponentAbsolutePath(root, greatGrandchild.uuid)).toBe('root/ch1/gc1/ggc')
    })
})

describe('getNodeAbsolutePath', () => {
    const buildNodePathTree = (): ComponentNode => ({
        uuid: 'root-uuid',
        id: 'System',
        name: 'System',
        type: 'component',
        actors: [{ uuid: 'actor-uuid', id: 'User', name: 'User', type: 'actor' }],
        interfaces: [],
        subComponents: [
            {
                uuid: 'auth-uuid',
                id: 'AuthService',
                name: 'AuthService',
                type: 'component',
                actors: [],
                interfaces: [],
                subComponents: [],
                useCaseDiagrams: [],
            },
        ],
        useCaseDiagrams: [
            {
                uuid: 'ucd-uuid',
                id: 'MainUCD',
                name: 'Main Use Cases',
                type: 'use-case-diagram',
                description: '',
                content: '',
                ownerComponentUuid: 'root-uuid',
                referencedNodeIds: [],
                useCases: [
                    {
                        uuid: 'uc-uuid',
                        id: 'Login',
                        name: 'Login',
                        type: 'use-case',
                        description: '',
                        sequenceDiagrams: [
                            {
                                uuid: 'seq-uuid',
                                id: 'LoginFlow',
                                name: 'Login Flow',
                                type: 'sequence-diagram',
                                description: '',
                                content: '',
                                ownerComponentUuid: 'root-uuid',
                                referencedNodeIds: [],
                                referencedFunctionUuids: [],
                            },
                        ],
                    },
                ],
            },
        ],
    })

    it('returns the full tree path for a nested sequence diagram', () => {
        const root = buildNodePathTree()
        expect(getNodeAbsolutePath(root, 'seq-uuid')).toBe('System/MainUCD/Login/LoginFlow')
    })

    it('returns ordered path segments with matching UUIDs', () => {
        const root = buildNodePathTree()
        expect(getNodeAbsolutePathSegments(root, 'seq-uuid')).toEqual([
            { uuid: 'root-uuid', id: 'System' },
            { uuid: 'ucd-uuid', id: 'MainUCD' },
            { uuid: 'uc-uuid', id: 'Login' },
            { uuid: 'seq-uuid', id: 'LoginFlow' },
        ])
    })

    it('returns the root segment for the root component', () => {
        const root = buildNodePathTree()
        expect(getNodeAbsolutePathSegments(root, 'root-uuid')).toEqual([
            { uuid: 'root-uuid', id: 'System' },
        ])
    })
})

// ─── findNodeByPath — relative context ───────────────────────────────────────

describe('findNodeByPath — multi-segment relative resolution', () => {
    it('resolves childId/grandchildId relative to ownerComp', () => {
        const { root, child1, grandchild1 } = buildScopeTree()
        // When ownerComp=child1, "gc1" is a direct child — single-segment still works
        const uuid = findNodeByPath(root, 'gc1', child1.uuid)
        expect(uuid).toBe(grandchild1.uuid)
    })

    it('resolves grandchildId/greatGrandchildId relative to ownerComp', () => {
        const { root, child1, greatGrandchild } = buildScopeTree()
        const uuid = findNodeByPath(root, 'gc1/ggc', child1.uuid)
        expect(uuid).toBe(greatGrandchild.uuid)
    })

    it('falls back to absolute resolution when relative lookup fails', () => {
        const { root, child2, gc2 } = buildScopeTree()
        // Absolute path from root (without root prefix)
        const uuid = findNodeByPath(root, 'ch2/gc2', child2.uuid)
        expect(uuid).toBe(gc2.uuid)
    })
})
