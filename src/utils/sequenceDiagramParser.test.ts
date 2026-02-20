// FULL CONTENT OF: src/utils/sequenceDiagramParser.test.ts
// Apply with: cp session-state/files/sequenceDiagramParser.test.ts src/utils/sequenceDiagramParser.test.ts
// ---------------------------------------------------------------
// @vitest-environment node
import { describe, it, expect } from "vitest"
import { parseSequenceDiagram } from "./sequenceDiagramParser"
import type { ComponentNode } from "../store/types"

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
})
