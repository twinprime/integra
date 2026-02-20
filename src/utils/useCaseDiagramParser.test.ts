// @vitest-environment node
import { describe, it, expect } from "vitest"
import { parseUseCaseDiagram } from "./useCaseDiagramParser"
import type { ComponentNode } from "../store/types"

// Mock root component
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
          uuid: "diagram-uuid",
          id: "diagram1",
          name: "Diagram 1",
          type: "use-case-diagram",
          content: "",
          description: "",
          ownerComponentUuid: "comp1-uuid",
          referencedNodeIds: [],
          useCases: [],
        }
      ],
      interfaces: [],
    },
  ],
  actors: [],
  useCaseDiagrams: [],
  interfaces: [],
})

describe("parseUseCaseDiagram", () => {
  it("should add actors to component and use cases to the diagram", () => {
    const rootComponent = createInitialSystem()
    const content = `
            actor "Customer" as cust
            use case "Buy Item" as buy
            cust --> buy
        `

    const newSystem = parseUseCaseDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    const comp = newSystem.subComponents[0]
    const diagram = comp.useCaseDiagrams[0]

    expect(comp.actors).toHaveLength(1)
    expect(comp.actors[0].id).toBe("cust")
    expect(comp.actors[0].name).toBe("Customer")

    expect(diagram.useCases).toHaveLength(1)
    expect(diagram.useCases[0].id).toBe("buy")
    expect(diagram.useCases[0].name).toBe("Buy Item")

    // referencedNodeIds should contain the UUIDs of actor and use case, not their string ids
    expect(diagram.referencedNodeIds).toHaveLength(2)
    expect(diagram.referencedNodeIds).toContain(comp.actors[0].uuid)
    expect(diagram.referencedNodeIds).toContain(diagram.useCases[0].uuid)
    expect(diagram.referencedNodeIds).not.toContain("cust")
    expect(diagram.referencedNodeIds).not.toContain("buy")
  })

  it("should update existing entities", () => {
    const rootComponent = createInitialSystem()
    rootComponent.subComponents[0].actors.push({
      uuid: "cust-uuid",
      id: "cust",
      name: "Old Name",
      type: "actor",
    })

    const content = `actor "New Name" as cust`
    const newSystem = parseUseCaseDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    const comp = newSystem.subComponents[0]

    expect(comp.actors[0].name).toBe("New Name")
  })

  it("should reference an existing actor from another component using 'from' clause", () => {
    const rootComponent = createInitialSystem()
    // Add an actor in the root component that will be referenced via "from"
    rootComponent.actors.push({
      uuid: "root-actor-uuid",
      id: "admin",
      name: "Admin",
      type: "actor",
    })

    const content = `
      actor "Admin" from root/admin as admin
      use case "Buy Item" as buy
      admin --> buy
    `
    const newSystem = parseUseCaseDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    const comp = newSystem.subComponents[0]
    const diagram = comp.useCaseDiagrams[0]

    // "admin" should NOT be added to comp1 (it's a cross-component reference)
    expect(comp.actors.filter(a => a.id === "admin")).toHaveLength(0)

    // The diagram should reference the existing actor's UUID
    expect(diagram.referencedNodeIds).toContain("root-actor-uuid")

    // The use case should still be created normally
    expect(diagram.useCases).toHaveLength(1)
    expect(diagram.useCases[0].id).toBe("buy")
  })
})
