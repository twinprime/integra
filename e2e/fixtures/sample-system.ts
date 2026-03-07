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
  fn: "test-fn-uuid",
  orderComp: "test-order-uuid",
  orderUcd: "test-order-ucd-uuid",
  orderUc: "test-order-uc-uuid",
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
