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
      useCases: [],
      useCaseDiagrams: [],
      sequenceDiagrams: [],
      interfaces: [],
    },
  ],
  actors: [],
  useCases: [],
  useCaseDiagrams: [],
  sequenceDiagrams: [],
  interfaces: [],
})

describe("parseUseCaseDiagram", () => {
  it("should add actors and use cases to the component", () => {
    const rootComponent = createInitialSystem()
    const content = `
            actor "Customer" as cust
            use case "Buy Item" as buy
            cust --> buy
        `

    const newSystem = parseUseCaseDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    const comp = newSystem.subComponents[0]

    expect(comp.actors).toHaveLength(1)
    expect(comp.actors[0].id).toBe("cust")
    expect(comp.actors[0].name).toBe("Customer")

    expect(comp.useCases).toHaveLength(1)
    expect(comp.useCases[0].id).toBe("buy")
    expect(comp.useCases[0].name).toBe("Buy Item")
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
