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
