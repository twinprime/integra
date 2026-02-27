// FULL CONTENT OF: src/utils/sequenceDiagramParser.test.ts
// Apply with: cp session-state/files/sequenceDiagramParser.test.ts src/utils/sequenceDiagramParser.test.ts
// ---------------------------------------------------------------
// @vitest-environment node
import { describe, it, expect } from "vitest"
import { parseSequenceDiagram, analyzeSequenceDiagramChanges, paramsToString } from "./sequenceDiagramParser"
import type { ComponentNode, Parameter } from "../store/types"

const createInitialSystem = (): ComponentNode => ({
  uuid: "root-uuid",
  id: "root",
  name: "Root",
  type: "component",
  subComponents: [
    {
      uuid: "comp1-uuid",
      id: "comp1",
      name: "Component 1",
      type: "component",
      description: "Test Component",
      subComponents: [],
      actors: [],
      useCaseDiagrams: [
        {
          uuid: "uc-diagram-uuid",
          id: "uc-diagram",
          name: "UC Diagram",
          type: "use-case-diagram",
          content: "",
          description: "",
          ownerComponentUuid: "comp1-uuid",
          referencedNodeIds: [],
          useCases: [
            {
              uuid: "use-case-uuid",
              id: "use-case",
              name: "Use Case",
              type: "use-case",
              description: "",
              sequenceDiagrams: [
                {
                  uuid: "diagram-uuid",
                  id: "diagram",
                  name: "Sequence Diagram",
                  type: "sequence-diagram",
                  content: "",
                  description: "",
                  ownerComponentUuid: "comp1-uuid",
                  referencedNodeIds: [],
                  referencedFunctionUuids: [],
                }
              ],
            }
          ],
        }
      ],
      interfaces: [],
    },
  ],
  actors: [],
  useCaseDiagrams: [],
  interfaces: [],
})

describe("parseSequenceDiagram", () => {
  it("should create participants as sub-components", () => {
    const rootComponent = createInitialSystem()
    const content = `
            actor alice
            component bob
        `

    const newSystem = parseSequenceDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    const comp = newSystem.subComponents[0]

    expect(comp.subComponents).toHaveLength(1)
    expect(comp.subComponents[0].id).toBe("bob")

    expect(comp.actors).toHaveLength(1)
    expect(comp.actors[0].id).toBe("alice")

    // referencedNodeIds should contain UUIDs, not string ids
    const diagram = comp.useCaseDiagrams[0].useCases[0].sequenceDiagrams[0]
    expect(diagram.referencedNodeIds).toContain(comp.actors[0].uuid)
    expect(diagram.referencedNodeIds).toContain(comp.subComponents[0].uuid)
    expect(diagram.referencedNodeIds).not.toContain("alice")
    expect(diagram.referencedNodeIds).not.toContain("bob")
  })

  it("should create interface and function from new-format message", () => {
    const rootComponent = createInitialSystem()
    const content = `
            component client
            component service
            client->>service: ExplorationsAPI:createExploration(id: number)
        `

    const newSystem = parseSequenceDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    const comp = newSystem.subComponents[0]
    const service = comp.subComponents.find((c) => c.id === "service")
    expect(service).toBeDefined()

    expect(service!.interfaces).toHaveLength(1)
    const iface = service!.interfaces[0]
    expect(iface.id).toBe("ExplorationsAPI")
    expect(iface.type).toBe("rest")

    expect(iface.functions).toHaveLength(1)
    const fn = iface.functions[0]
    expect(fn.id).toBe("createExploration")
    expect(fn.parameters).toHaveLength(1)
    expect(fn.parameters[0].name).toBe("id")
    expect(fn.parameters[0].type).toBe("number")
    expect(fn.parameters[0].required).toBe(true)
  })

  it("should parse optional parameters (type?)", () => {
    const rootComponent = createInitialSystem()
    const content = `
            component client
            component service
            client->>service: MyAPI:doSomething(name: string, flag: boolean?)
        `

    const newSystem = parseSequenceDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    const comp = newSystem.subComponents[0]
    const service = comp.subComponents.find((c) => c.id === "service")
    const fn = service!.interfaces[0].functions[0]

    expect(fn.parameters[0]).toMatchObject({ name: "name", type: "string", required: true })
    expect(fn.parameters[1]).toMatchObject({ name: "flag", type: "boolean", required: false })
  })

  it("should throw on parameter mismatch for existing function", () => {
    const rootComponent = createInitialSystem()
    const first = parseSequenceDiagram(
      `component a\ncomponent b\na->>b: API:fn(x: number)`,
      rootComponent,
      "comp1-uuid",
      "diagram-uuid"
    )

    expect(() =>
      parseSequenceDiagram(
        `component a\ncomponent b\na->>b: API:fn(x: string)`,
        first,
        "comp1-uuid",
        "diagram-uuid"
      )
    ).toThrow(/Parameter mismatch.*fn.*API/)
  })

  it("should assign interface to sender for kafka type", () => {
    const rootComponent = createInitialSystem()
    // First create an interface with kafka type manually
    const systemWithKafka: ComponentNode = {
      ...rootComponent,
      subComponents: [
        {
          ...(rootComponent.subComponents[0]),
          subComponents: [
            {
              uuid: "producer-uuid",
              id: "producer",
              name: "producer",
              type: "component",
              subComponents: [],
              actors: [],
              useCaseDiagrams: [],
              interfaces: [
                {
                  uuid: "iface-uuid",
                  id: "TopicEvents",
                  name: "TopicEvents",
                  type: "kafka",
                  functions: [],
                }
              ],
            },
            {
              uuid: "consumer-uuid",
              id: "consumer",
              name: "consumer",
              type: "component",
              subComponents: [],
              actors: [],
              useCaseDiagrams: [],
              interfaces: [],
            },
          ],
        }
      ],
    }

    const content = `
            component producer
            component consumer
            producer->>consumer: TopicEvents:userCreated(userId: string)
        `

    const newSystem = parseSequenceDiagram(content, systemWithKafka, "comp1-uuid", "diagram-uuid")
    const comp = newSystem.subComponents[0]
    const producer = comp.subComponents.find((c) => c.id === "producer")
    const consumer = comp.subComponents.find((c) => c.id === "consumer")

    // kafka: sender (producer) owns the interface
    const producerIface = producer!.interfaces.find((i) => i.id === "TopicEvents")
    expect(producerIface).toBeDefined()
    expect(producerIface!.functions).toHaveLength(1)
    expect(producerIface!.functions[0].id).toBe("userCreated")

    // consumer should NOT have the interface
    const consumerIface = consumer!.interfaces?.find((i) => i.id === "TopicEvents")
    expect(consumerIface).toBeUndefined()
  })

  it("should record referencedFunctionUuids on the diagram", () => {
    const rootComponent = createInitialSystem()
    const content = `
            component a
            component b
            a->>b: MyAPI:myFn(x: number)
        `

    const newSystem = parseSequenceDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    const comp = newSystem.subComponents[0]
    const b = comp.subComponents.find((c) => c.id === "b")
    const fn = b!.interfaces[0].functions[0]

    // Find the diagram
    const diagram = comp.useCaseDiagrams[0].useCases[0].sequenceDiagrams[0]
    expect(diagram.referencedFunctionUuids).toContain(fn.uuid)
  })

  it("should process system-level diagrams", () => {
    const rootComponent = createInitialSystem()
    const content = `
             component "SysComponent" as SysComponent
         `
    const newSystem = parseSequenceDiagram(content, rootComponent, "root-uuid", "diagram-uuid")

    expect(newSystem.subComponents).toHaveLength(2) // Initial 'comp1' + 'SysComponent'
    expect(
      newSystem.subComponents.find((c) => c.id === "SysComponent")
    ).toBeDefined()
  })

  it("should reference an existing actor from another component using 'from' clause", () => {
    const rootComponent = createInitialSystem()
    // Add an existing actor in root
    rootComponent.actors.push({
      uuid: "root-actor-uuid",
      id: "admin",
      name: "Admin",
      type: "actor",
    })

    const content = `
      actor "Admin" from root/admin as admin
      component "Service" as svc
      admin->>svc: ServiceAPI:doThing(id: number)
    `
    const newSystem = parseSequenceDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    const comp = newSystem.subComponents[0]

    // "admin" should NOT be created in comp1
    expect(comp.actors.filter(a => a.id === "admin")).toHaveLength(0)

    // The diagram should reference the existing actor UUID from the root
    const diagram = comp.useCaseDiagrams[0].useCases[0].sequenceDiagrams[0]
    expect(diagram.referencedNodeIds).toContain("root-actor-uuid")
  })

  it("should throw an error when actor 'from' path cannot be resolved", () => {
    const rootComponent = createInitialSystem()
    const content = `actor "Ghost" from nonexistent/ghost as ghost`
    expect(() =>
      parseSequenceDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    ).toThrow('Cannot resolve actor "from" path: "nonexistent/ghost"')
  })

  it("should throw an error when component 'from' path cannot be resolved", () => {
    const rootComponent = createInitialSystem()
    const content = `component "Ghost" from nonexistent/ghost as ghost`
    expect(() =>
      parseSequenceDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    ).toThrow('Cannot resolve component "from" path: "nonexistent/ghost"')
  })

  it("should allow a second call on the same function id with different param count (overload)", () => {
    const system1 = parseSequenceDiagram(
      `component a\ncomponent b\na->>b: API:fn(id: number)`,
      createInitialSystem(),
      "comp1-uuid",
      "diagram-uuid",
    )
    // Different param count → treated as a new overload, no error
    const system2 = parseSequenceDiagram(
      `component a\ncomponent b\na->>b: API:fn(id: number, name: string)`,
      system1,
      "comp1-uuid",
      "diagram-uuid",
    )
    const b = system2.subComponents[0].subComponents.find((c) => c.id === "b")
    expect(b!.interfaces[0].functions).toHaveLength(2)
    expect(b!.interfaces[0].functions[0].parameters).toHaveLength(1)
    expect(b!.interfaces[0].functions[1].parameters).toHaveLength(2)
  })
})

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildSystemWithFunction(
  params: Parameter[],
  fnUuid = "fn-uuid",
): ComponentNode {
  return {
    uuid: "root-uuid",
    id: "root",
    name: "Root",
    type: "component",
    subComponents: [
      {
        uuid: "comp1-uuid",
        id: "comp1",
        name: "Comp 1",
        type: "component",
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [
          {
            uuid: "api-iface-uuid",
            id: "API",
            name: "API",
            type: "rest",
            functions: [{ uuid: fnUuid, id: "fn", parameters: params }],
          },
        ],
      },
    ],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
  }
}

// ─── paramsToString ───────────────────────────────────────────────────────────

describe("paramsToString", () => {
  it("converts required and optional params to string", () => {
    expect(
      paramsToString([
        { name: "id", type: "number", required: true },
        { name: "flag", type: "boolean", required: false },
      ]),
    ).toBe("id: number, flag: boolean?")
  })

  it("returns empty string for no params", () => {
    expect(paramsToString([])).toBe("")
  })
})

// ─── analyzeSequenceDiagramChanges ───────────────────────────────────────────

describe("analyzeSequenceDiagramChanges", () => {
  const FN_UUID = "fn-uuid"
  const CURRENT = "current-diag"
  const OTHER = "other-diag"

  const sharedDiags = [
    { uuid: CURRENT, name: "Current", referencedFunctionUuids: [FN_UUID] },
    { uuid: OTHER, name: "Other", referencedFunctionUuids: [FN_UUID] },
  ]
  const exclusiveDiags = [
    { uuid: CURRENT, name: "Current", referencedFunctionUuids: [FN_UUID] },
  ]

  it("returns empty when function is brand new (not in system)", () => {
    const system = buildSystemWithFunction(
      [{ name: "id", type: "number", required: true }],
      FN_UUID,
    )
    const matches = analyzeSequenceDiagramChanges(
      "component a\ncomponent b\na->>b: OTHER_API:newFn(x: string)",
      system,
      CURRENT,
      sharedDiags,
    )
    expect(matches).toHaveLength(0)
  })

  it("returns empty when params are identical", () => {
    const system = buildSystemWithFunction(
      [{ name: "id", type: "number", required: true }],
      FN_UUID,
    )
    const matches = analyzeSequenceDiagramChanges(
      "component a\ncomponent b\na->>b: API:fn(id: number)",
      system,
      CURRENT,
      sharedDiags,
    )
    expect(matches).toHaveLength(0)
  })

  it("returns compatible match (different count) when function is shared", () => {
    const system = buildSystemWithFunction(
      [{ name: "id", type: "number", required: true }],
      FN_UUID,
    )
    const matches = analyzeSequenceDiagramChanges(
      "component a\ncomponent b\na->>b: API:fn(id: number, name: string)",
      system,
      CURRENT,
      sharedDiags,
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].kind).toBe("compatible")
    expect(matches[0].functionId).toBe("fn")
    expect(matches[0].oldParams).toHaveLength(1)
    expect(matches[0].newParams).toHaveLength(2)
    expect(matches[0].affectedDiagramUuids).toEqual([OTHER])
  })

  it("returns compatible match even when function is exclusively owned", () => {
    const system = buildSystemWithFunction(
      [{ name: "id", type: "number", required: true }],
      FN_UUID,
    )
    const matches = analyzeSequenceDiagramChanges(
      "component a\ncomponent b\na->>b: API:fn(id: number, name: string)",
      system,
      CURRENT,
      exclusiveDiags,
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].kind).toBe("compatible")
    expect(matches[0].affectedDiagramUuids).toHaveLength(0)
  })

  it("returns incompatible match (same count, diff types) when function is shared", () => {
    const system = buildSystemWithFunction(
      [{ name: "id", type: "number", required: true }],
      FN_UUID,
    )
    const matches = analyzeSequenceDiagramChanges(
      "component a\ncomponent b\na->>b: API:fn(id: string)",
      system,
      CURRENT,
      sharedDiags,
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].kind).toBe("incompatible")
    expect(matches[0].oldParams[0].type).toBe("number")
    expect(matches[0].newParams[0].type).toBe("string")
    expect(matches[0].affectedDiagramUuids).toEqual([OTHER])
  })

  it("skips incompatible match when function is exclusively owned", () => {
    const system = buildSystemWithFunction(
      [{ name: "id", type: "number", required: true }],
      FN_UUID,
    )
    const matches = analyzeSequenceDiagramChanges(
      "component a\ncomponent b\na->>b: API:fn(id: string)",
      system,
      CURRENT,
      exclusiveDiags,
    )
    expect(matches).toHaveLength(0)
  })

  it("deduplicates multiple calls to the same function in content", () => {
    const system = buildSystemWithFunction(
      [{ name: "id", type: "number", required: true }],
      FN_UUID,
    )
    const matches = analyzeSequenceDiagramChanges(
      "component a\ncomponent b\na->>b: API:fn(id: string)\na->>b: API:fn(id: string)",
      system,
      CURRENT,
      sharedDiags,
    )
    expect(matches).toHaveLength(1)
  })
})

describe("parseSequenceDiagram — UseCase message references", () => {
  const createSystemWithUseCase = (): ComponentNode => ({
    uuid: "root-uuid",
    id: "root",
    name: "Root",
    type: "component",
    subComponents: [
      {
        uuid: "owner-uuid",
        id: "owner",
        name: "Owner",
        type: "component",
        description: "",
        subComponents: [
          {
            uuid: "svc-uuid",
            id: "svc",
            name: "Service",
            type: "component",
            description: "",
            subComponents: [],
            actors: [],
            useCaseDiagrams: [
              {
                uuid: "uc-diag-uuid",
                id: "uc-diag",
                name: "UC Diagram",
                type: "use-case-diagram",
                content: "",
                description: "",
                ownerComponentUuid: "svc-uuid",
                referencedNodeIds: [],
                useCases: [
                  {
                    uuid: "login-uuid",
                    id: "login",
                    name: "Login",
                    type: "use-case",
                    description: "",
                    sequenceDiagrams: [],
                  },
                ],
              },
            ],
            interfaces: [],
          },
        ],
        actors: [{ uuid: "user-uuid", id: "user", name: "User", type: "actor" }],
        useCaseDiagrams: [
          {
            uuid: "owner-uc-diag-uuid",
            id: "owner-uc-diag",
            name: "Owner UC Diagram",
            type: "use-case-diagram",
            content: "",
            description: "",
            ownerComponentUuid: "owner-uuid",
            referencedNodeIds: [],
            useCases: [
              {
                uuid: "owner-uc-uuid",
                id: "owner-uc",
                name: "Owner UC",
                type: "use-case",
                description: "",
                sequenceDiagrams: [
                  {
                    uuid: "seq-uuid",
                    id: "seq",
                    name: "Sequence",
                    type: "sequence-diagram",
                    content: "",
                    description: "",
                    ownerComponentUuid: "owner-uuid",
                    referencedNodeIds: [],
                    referencedFunctionUuids: [],
                  },
                ],
              },
            ],
          },
        ],
        interfaces: [],
      },
    ],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
  })

  it("resolves UseCase:ucId to the use case UUID in referencedNodeIds", () => {
    const root = createSystemWithUseCase()
    const content = `
      actor "User" as user
      component "Service" as svc
      user->>svc: UseCase:login
    `
    const result = parseSequenceDiagram(content, root, "owner-uuid", "seq-uuid")
    const owner = result.subComponents[0]
    const seq = owner.useCaseDiagrams[0].useCases[0].sequenceDiagrams[0]
    expect(seq.referencedNodeIds).toContain("login-uuid")
  })

  it("skips unresolvable use case ids gracefully (no error, no uuid added)", () => {
    const root = createSystemWithUseCase()
    const content = `
      actor "User" as user
      component "Service" as svc
      user->>svc: UseCase:nonexistent
    `
    const result = parseSequenceDiagram(content, root, "owner-uuid", "seq-uuid")
    const owner = result.subComponents[0]
    const seq = owner.useCaseDiagrams[0].useCases[0].sequenceDiagrams[0]
    expect(seq.referencedNodeIds).not.toContain("login-uuid")
    // Should not throw and still resolve participant references
    expect(seq.referencedNodeIds).toContain("user-uuid")
  })

  it("deduplicates multiple UseCase references to the same use case", () => {
    const root = createSystemWithUseCase()
    const content = `
      actor "User" as user
      component "Service" as svc
      user->>svc: UseCase:login
      user->>svc: UseCase:login
    `
    const result = parseSequenceDiagram(content, root, "owner-uuid", "seq-uuid")
    const owner = result.subComponents[0]
    const seq = owner.useCaseDiagrams[0].useCases[0].sequenceDiagrams[0]
    const loginRefs = seq.referencedNodeIds.filter((id) => id === "login-uuid")
    expect(loginRefs).toHaveLength(1)
  })
})

describe("parseSequenceDiagram — self-referencing owner component", () => {
  const createSystem = (): ComponentNode => ({
    uuid: "root-uuid",
    id: "root",
    name: "Root",
    type: "component",
    subComponents: [
      {
        uuid: "svc-uuid",
        id: "svc",
        name: "Service",
        type: "component",
        description: "",
        subComponents: [],
        actors: [{ uuid: "user-uuid", id: "user", name: "User", type: "actor" }],
        useCaseDiagrams: [
          {
            uuid: "uc-diag-uuid",
            id: "uc-diag",
            name: "UC Diagram",
            type: "use-case-diagram",
            content: "",
            description: "",
            ownerComponentUuid: "svc-uuid",
            referencedNodeIds: [],
            useCases: [
              {
                uuid: "login-uuid",
                id: "login",
                name: "Login",
                type: "use-case",
                description: "",
                sequenceDiagrams: [
                  {
                    uuid: "seq-uuid",
                    id: "seq",
                    name: "Seq",
                    type: "sequence-diagram",
                    content: "",
                    description: "",
                    ownerComponentUuid: "svc-uuid",
                    referencedNodeIds: [],
                    referencedFunctionUuids: [],
                  },
                ],
              },
            ],
          },
        ],
        interfaces: [],
      },
    ],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
  })

  it("does not create a new subComponent when component id matches owner", () => {
    const root = createSystem()
    const content = `
      actor "User" as user
      component "Service" as svc
      user->>svc: UseCase:login
    `
    const result = parseSequenceDiagram(content, root, "svc-uuid", "seq-uuid")
    const svc = result.subComponents[0]
    // svc should not have a child named "svc"
    expect(svc.subComponents.find((c) => c.id === "svc")).toBeUndefined()
  })

  it("includes owner uuid in referencedNodeIds when self-referenced", () => {
    const root = createSystem()
    const content = `
      actor "User" as user
      component "Service" as svc
    `
    const result = parseSequenceDiagram(content, root, "svc-uuid", "seq-uuid")
    const seq = result.subComponents[0].useCaseDiagrams[0].useCases[0].sequenceDiagrams[0]
    expect(seq.referencedNodeIds).toContain("svc-uuid")
  })

  it("resolves UseCase:ucId when the receiver is the owner component (self-receiver)", () => {
    const root = createSystem()
    const content = `
      actor "User" as user
      component "Service" as svc
      user->>svc: UseCase:login
    `
    const result = parseSequenceDiagram(content, root, "svc-uuid", "seq-uuid")
    const seq = result.subComponents[0].useCaseDiagrams[0].useCases[0].sequenceDiagrams[0]
    expect(seq.referencedNodeIds).toContain("login-uuid")
  })

  it("derives interface on owner when owner is message receiver (self-ref)", () => {
    const root = createSystem()
    const content = `
      actor "User" as user
      component "Service" as svc
      user->>svc: ExplorationsAPI:create(id: number)
    `
    const result = parseSequenceDiagram(content, root, "svc-uuid", "seq-uuid")
    const svc = result.subComponents[0]
    expect(svc.interfaces?.find((i) => i.id === "ExplorationsAPI")).toBeDefined()
  })
})
