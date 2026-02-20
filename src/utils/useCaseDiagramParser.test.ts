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
})
