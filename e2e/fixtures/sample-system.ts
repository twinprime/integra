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
} as const

// ─── Fixture ─────────────────────────────────────────────────────────────────

const actor: ActorNode = {
  uuid: UUIDS.actor,
  id: "User",
  name: "User",
  type: "actor",
}

const seqDiagram: SequenceDiagramNode = {
  uuid: UUIDS.seq,
  id: "LoginFlow",
  name: "Login Flow",
  type: "sequence-diagram",
  ownerComponentUuid: UUIDS.root,
  referencedNodeIds: [UUIDS.authComp],
  referencedFunctionUuids: [UUIDS.fn],
  content: [
    'actor "User" as User',
    'component "AuthService" as AuthService',
    "User->>AuthService: IAuth:login()",
    "AuthService-->>User: done",
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
    'actor "User" as User',
    'use case "Login" as Login',
    "User --> Login",
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
  subComponents: [authComp],
  actors: [actor],
  useCaseDiagrams: [ucDiagram],
  interfaces: [],
}

/** Zustand persist envelope written to localStorage["integra-system"] */
export function makeLocalStorageValue(): string {
  return JSON.stringify({ state: { rootComponent: sampleSystem }, version: 0 })
}
