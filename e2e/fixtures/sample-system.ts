import type {
  ComponentNode,
  ActorNode,
  UseCaseDiagramNode,
  SequenceDiagramNode,
  UseCaseNode,
} from "../../src/store/types"

// ─── UUIDs ────────────────────────────────────────────────────────────────────

export const UUIDS = {
  root: "test-root-uuid",
  actor: "test-actor-uuid",
  ucd: "test-ucd-uuid",
  uc: "test-uc-uuid",
  seq: "test-seq-uuid",
  authComp: "test-auth-uuid",
  iface: "test-iface-uuid",
  emptyIface: "test-empty-iface-uuid",
  fn: "test-fn-uuid",
  orderComp: "test-order-uuid",
  orderUcd: "test-order-ucd-uuid",
  orderUc: "test-order-uc-uuid",
  orderIface: "test-order-iface-uuid",
  orderFn: "test-order-fn-uuid",
  emptySeq: "test-empty-seq-uuid",
} as const

// ─── Fixture ─────────────────────────────────────────────────────────────────

const actor: ActorNode = {
  uuid: UUIDS.actor,
  id: "User",
  name: "User",
  type: "actor",
}

const orderUcNode: UseCaseNode = {
  uuid: UUIDS.orderUc,
  id: "PlaceOrder",
  name: "Place Order",
  type: "use-case",
  sequenceDiagrams: [],
}

const orderUcd: UseCaseDiagramNode = {
  uuid: UUIDS.orderUcd,
  id: "OrderUCD",
  name: "Order Use Cases",
  type: "use-case-diagram",
  ownerComponentUuid: UUIDS.orderComp,
  referencedNodeIds: [UUIDS.actor, UUIDS.orderUc],
  content: ["actor User", "use case PlaceOrder", "User ->> PlaceOrder"].join("\n"),
  useCases: [orderUcNode],
}

const orderComp: ComponentNode = {
  uuid: UUIDS.orderComp,
  id: "OrderService",
  name: "OrderService",
  type: "component",
  subComponents: [],
  actors: [],
  useCaseDiagrams: [orderUcd],
  interfaces: [],
}

const seqDiagram: SequenceDiagramNode = {
  uuid: UUIDS.seq,
  id: "LoginFlow",
  name: "Login Flow",
  type: "sequence-diagram",
  ownerComponentUuid: UUIDS.root,
  referencedNodeIds: [UUIDS.authComp, UUIDS.orderUc],
  referencedFunctionUuids: [UUIDS.fn],
  content: [
    "actor User",
    "component AuthService",
    "component OrderService",
    "User ->> AuthService: IAuth:login()",
    "AuthService -->> User: done",
    "opt if order pending",
    "  User ->> AuthService: IAuth:login()",
    "end",
    "User ->> OrderService: UseCase:OrderService/PlaceOrder:Place an order",
  ].join("\n"),
}

const ucNode: UseCaseNode = {
  uuid: UUIDS.uc,
  id: "Login",
  name: "Login",
  type: "use-case",
  sequenceDiagrams: [seqDiagram],
}

const ucDiagram: UseCaseDiagramNode = {
  uuid: UUIDS.ucd,
  id: "MainUCD",
  name: "Main Use Cases",
  type: "use-case-diagram",
  ownerComponentUuid: UUIDS.root,
  referencedNodeIds: [UUIDS.actor, UUIDS.uc],
  content: [
    "actor User",
    "use case Login",
    "User ->> Login",
  ].join("\n"),
  useCases: [ucNode],
}

const authComp: ComponentNode = {
  uuid: UUIDS.authComp,
  id: "AuthService",
  name: "AuthService",
  type: "component",
  subComponents: [],
  actors: [],
  useCaseDiagrams: [],
  interfaces: [
    {
      uuid: UUIDS.iface,
      id: "IAuth",
      name: "IAuth",
      type: "rest",
      functions: [
        {
          uuid: UUIDS.fn,
          id: "login",
          parameters: [],
        },
      ],
    },
    {
      uuid: UUIDS.emptyIface,
      id: "IEmpty",
      name: "IEmpty",
      type: "other",
      functions: [],
    },
  ],
}

export const sampleSystem: ComponentNode = {
  uuid: UUIDS.root,
  id: "System",
  name: "System",
  type: "component",
  subComponents: [authComp, orderComp],
  actors: [actor],
  useCaseDiagrams: [ucDiagram],
  interfaces: [],
}

/** Zustand persist envelope written to localStorage["integra-system"] */
export function makeLocalStorageValue(): string {
  return JSON.stringify({ state: { rootComponent: sampleSystem }, version: 0 })
}

/**
 * Variant fixture with an extra empty sequence diagram attached to the Login use case.
 * The empty diagram starts in edit mode (no content), making e2e interaction easier.
 */
export function makeLocalStorageValueWithEmptySeq(): string {
  const emptySeq: SequenceDiagramNode = {
    uuid: UUIDS.emptySeq,
    id: "NewFlow",
    name: "New Flow",
    type: "sequence-diagram",
    ownerComponentUuid: UUIDS.root,
    referencedNodeIds: [],
    referencedFunctionUuids: [],
    content: "",
  }

  const systemWithEmptySeq: ComponentNode = {
    ...sampleSystem,
    useCaseDiagrams: sampleSystem.useCaseDiagrams.map((ucd) => ({
      ...ucd,
      useCases: ucd.useCases.map((uc) => ({
        ...uc,
        sequenceDiagrams: [...uc.sequenceDiagrams, emptySeq],
      })),
    })),
  }

  return JSON.stringify({ state: { rootComponent: systemWithEmptySeq }, version: 0 })
}

/**
 * Variant fixture where AuthService's IAuth interface is called ONLY inside an opt block.
 * Used to verify that block-nested messages are included in the component class diagram.
 */
export function makeLocalStorageValueWithBlockOnlyCall(): string {
  const blockOnlySeq: SequenceDiagramNode = {
    uuid: "block-only-seq-uuid",
    id: "BlockFlow",
    name: "Block Flow",
    type: "sequence-diagram",
    ownerComponentUuid: UUIDS.root,
    referencedNodeIds: [UUIDS.authComp],
    referencedFunctionUuids: [UUIDS.fn],
    content: [
      "actor User",
      "component AuthService",
      "opt if refresh needed",
      "  User ->> AuthService: IAuth:login()",
      "end",
    ].join("\n"),
  }

  const systemWithBlockOnly: ComponentNode = {
    ...sampleSystem,
    // Replace the Login Flow with one that only calls IAuth inside a block
    useCaseDiagrams: sampleSystem.useCaseDiagrams.map((ucd) => ({
      ...ucd,
      useCases: ucd.useCases.map((uc) => ({
        ...uc,
        sequenceDiagrams: [blockOnlySeq],
      })),
    })),
  }

  return JSON.stringify({ state: { rootComponent: systemWithBlockOnly }, version: 0 })
}

/**
 * Variant fixture where AuthService calls OrderService's IOrder interface.
 * Used to verify that dependency (outgoing) arrows appear in the component class diagram.
 *
 * OrderService gains an IOrder interface with a process() method.
 * A new sequence diagram shows AuthService ->> OrderService: IOrder:process()
 */
export function makeLocalStorageValueWithDependency(): string {
  const orderWithIface: ComponentNode = {
    ...sampleSystem.subComponents[1],
    interfaces: [
      {
        uuid: UUIDS.orderIface,
        id: "IOrder",
        name: "IOrder",
        type: "rest",
        functions: [
          {
            uuid: UUIDS.orderFn,
            id: "process",
            parameters: [{ name: "orderId", type: "string", required: true }],
          },
        ],
      },
    ],
  }

  const depSeq: SequenceDiagramNode = {
    uuid: "dep-seq-uuid",
    id: "AuthToOrder",
    name: "Auth To Order",
    type: "sequence-diagram",
    ownerComponentUuid: UUIDS.root,
    referencedNodeIds: [UUIDS.authComp, UUIDS.orderComp],
    referencedFunctionUuids: [UUIDS.orderFn],
    content: [
      "component AuthService",
      "component OrderService",
      "AuthService ->> OrderService: IOrder:process(orderId: string)",
    ].join("\n"),
  }

  const systemWithDep: ComponentNode = {
    ...sampleSystem,
    subComponents: [sampleSystem.subComponents[0], orderWithIface],
    useCaseDiagrams: sampleSystem.useCaseDiagrams.map((ucd) => ({
      ...ucd,
      useCases: ucd.useCases.map((uc) => ({
        ...uc,
        sequenceDiagrams: [...uc.sequenceDiagrams, depSeq],
      })),
    })),
  }

  return JSON.stringify({ state: { rootComponent: systemWithDep }, version: 0 })
}

/**
 * Variant fixture where the seq diagram has a function ref message with a \n display label.
 * Used to verify that \n in labels produces a <br/> visual line break in the diagram.
 */
export function makeLocalStorageValueWithNewlineLabel(): string {
  const seqWithNewlineLabel: SequenceDiagramNode = {
    ...seqDiagram,
    content: [
      "actor User",
      "component AuthService",
      "User ->> AuthService: IAuth:login():Sign\\nIn",
    ].join("\n"),
  }

  const systemWithNewlineLabel: ComponentNode = {
    ...sampleSystem,
    useCaseDiagrams: sampleSystem.useCaseDiagrams.map((ucd) => ({
      ...ucd,
      useCases: ucd.useCases.map((uc) => ({
        ...uc,
        sequenceDiagrams: [seqWithNewlineLabel],
      })),
    })),
  }

  return JSON.stringify({ state: { rootComponent: systemWithNewlineLabel }, version: 0 })
}

/**
 * Variant fixture where the same interface function is called on two different receivers.
 * Both AuthService and OrderService have an IHealth interface with a ping() function.
 * Used to verify that numbered label suffixes are added for different receivers.
 */
export function makeLocalStorageValueWithSameFunctionDifferentReceivers(): string {
  const healthIfaceAuth = {
    uuid: "health-iface-auth-uuid",
    id: "IHealth",
    name: "IHealth",
    type: "other" as const,
    functions: [{ uuid: "health-fn-auth-uuid", id: "ping", parameters: [] }],
  }
  const healthIfaceOrder = {
    uuid: "health-iface-order-uuid",
    id: "IHealth",
    name: "IHealth",
    type: "other" as const,
    functions: [{ uuid: "health-fn-order-uuid", id: "ping", parameters: [] }],
  }

  const authWithHealth: ComponentNode = {
    ...sampleSystem.subComponents[0],
    interfaces: [...sampleSystem.subComponents[0].interfaces, healthIfaceAuth],
  }
  const orderWithHealth: ComponentNode = {
    ...sampleSystem.subComponents[1],
    interfaces: [healthIfaceOrder],
  }

  const multiReceiverSeq: SequenceDiagramNode = {
    uuid: "multi-receiver-seq-uuid",
    id: "HealthCheck",
    name: "Health Check",
    type: "sequence-diagram",
    ownerComponentUuid: UUIDS.root,
    referencedNodeIds: [UUIDS.authComp, UUIDS.orderComp],
    referencedFunctionUuids: ["health-fn-auth-uuid", "health-fn-order-uuid"],
    content: [
      "actor User",
      "component AuthService",
      "component OrderService",
      "User ->> AuthService: IHealth:ping()",
      "User ->> OrderService: IHealth:ping()",
    ].join("\n"),
  }

  const systemWithMultiReceiver: ComponentNode = {
    ...sampleSystem,
    subComponents: [authWithHealth, orderWithHealth],
    useCaseDiagrams: sampleSystem.useCaseDiagrams.map((ucd) => ({
      ...ucd,
      useCases: ucd.useCases.map((uc) => ({
        ...uc,
        sequenceDiagrams: [...uc.sequenceDiagrams, multiReceiverSeq],
      })),
    })),
  }

  return JSON.stringify({ state: { rootComponent: systemWithMultiReceiver }, version: 0 })
}

/**
 * Variant with a sequence diagram that contains a Sequence:LoginFlow reference.
 * Used to test that renaming LoginFlow updates the referencing diagram content.
 */
export function makeLocalStorageValueWithSeqRef(): string {
  const refererSeq: SequenceDiagramNode = {
    uuid: "seq-referer-uuid",
    id: "MainFlow",
    name: "Main Flow",
    type: "sequence-diagram",
    ownerComponentUuid: UUIDS.root,
    referencedNodeIds: [UUIDS.seq],
    referencedFunctionUuids: [],
    content: [
      "actor User",
      "component AuthService",
      "User ->> AuthService: Sequence:LoginFlow",
    ].join("\n"),
  }

  const systemWithSeqRef: ComponentNode = {
    ...sampleSystem,
    useCaseDiagrams: sampleSystem.useCaseDiagrams.map((ucd) => ({
      ...ucd,
      useCases: ucd.useCases.map((uc) => ({
        ...uc,
        sequenceDiagrams: [...uc.sequenceDiagrams, refererSeq],
      })),
    })),
  }

  return JSON.stringify({ state: { rootComponent: systemWithSeqRef }, version: 0 })
}

/**
 * Fixture for interface inheritance tests.
 *
 * Tree shape:
 *   System (root)
 *     interfaces:
 *       - IRootService (uuid: "root-iface-uuid")  → functions: [doThing]
 *       - IUnimplemented (uuid: "unimpl-iface-uuid") → functions: []  ← no sub-component inherits this
 *     subComponents:
 *       - AuthService
 *           interfaces:
 *             - IAuth (normal, no inheritance)
 *             - IAuthDerived (uuid: "auth-derived-uuid", parentInterfaceUuid: "root-iface-uuid")
 *               → inherits IRootService; functions: [] (resolved at render time via InheritedInterface)
 *       - OrderService (unchanged)
 *
 * Expected UI behaviour:
 * - On root component: IRootService tab has NO warning (AuthService inherits it)
 *                      IUnimplemented tab HAS warning (no sub-component inherits it)
 * - On AuthService: IAuthDerived tab shows "Inherits" selector set to IRootService,
 *                   and shows doThing function as read-only (no edit input, no delete button)
 */
export function makeLocalStorageValueWithInheritance(): string {
  const authWithInherited: ComponentNode = {
    ...sampleSystem.subComponents[0], // AuthService
    interfaces: [
      ...sampleSystem.subComponents[0].interfaces,
      {
        uuid: "auth-derived-uuid",
        id: "IAuthDerived",
        name: "IAuthDerived",
        type: "rest",
        functions: [],
        parentInterfaceUuid: "root-iface-uuid",
      },
    ],
  }

  const rootWithInterfaces: ComponentNode = {
    ...sampleSystem,
    subComponents: [authWithInherited, sampleSystem.subComponents[1]],
    interfaces: [
      {
        uuid: "root-iface-uuid",
        id: "IRootService",
        name: "IRootService",
        type: "rest",
        functions: [
          { uuid: "root-fn-uuid", id: "doThing", parameters: [] },
        ],
      },
      {
        uuid: "unimpl-iface-uuid",
        id: "IUnimplemented",
        name: "IUnimplemented",
        type: "rest",
        functions: [],
      },
    ],
  }

  return JSON.stringify({ state: { rootComponent: rootWithInterfaces }, version: 0 })
}

/**
 * Variant fixture with an extra actor "GhostUser" added to the root component.
 * GhostUser is not referenced in any diagram's referencedNodeIds, so it is orphaned
 * and should show a delete button on hover in the tree.
 */
export function makeLocalStorageValueWithOrphanedActor(): string {
  const ghostActor: ActorNode = {
    uuid: "test-ghost-actor-uuid",
    id: "GhostUser",
    name: "GhostUser",
    type: "actor",
  }

  const systemWithGhost: ComponentNode = {
    ...sampleSystem,
    actors: [...sampleSystem.actors, ghostActor],
  }

  return JSON.stringify({ state: { rootComponent: systemWithGhost }, version: 0 })
}

/**
 * Variant of the base fixture where AuthService's interfaces are listed in [IEmpty, IAuth] order.
 * This exposes the interface-tab activation bug: IAuth is NOT the first tab, so it must be
 * explicitly activated by the navigation logic — it cannot be a lucky default.
 */
export function makeLocalStorageValueWithIfaceAsSecond(): string {
  const reorderedAuthComp = {
    ...sampleSystem.subComponents[0],
    interfaces: [...sampleSystem.subComponents[0].interfaces].reverse(),
  }
  const system = {
    ...sampleSystem,
    subComponents: [reorderedAuthComp, ...sampleSystem.subComponents.slice(1)],
  }
  return JSON.stringify({ state: { rootComponent: system }, version: 0 })
}
