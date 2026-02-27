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

  it("should add components declared in use case diagrams to the owning component", () => {
    const rootComponent = createInitialSystem()
    const content = `
      component "Payment Service" as paymentSvc
      use case "Pay" as pay
      paymentSvc --> pay
    `
    const newSystem = parseUseCaseDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    const comp = newSystem.subComponents[0]
    const diagram = comp.useCaseDiagrams[0]

    expect(comp.subComponents.find(c => c.id === "paymentSvc")).toBeDefined()
    expect(diagram.referencedNodeIds).toContain(
      comp.subComponents.find(c => c.id === "paymentSvc")!.uuid
    )
  })

  it("should reference an existing component via 'from' clause without upsert", () => {
    const rootComponent = createInitialSystem()
    rootComponent.subComponents.push({
      uuid: "other-comp-uuid",
      id: "otherComp",
      name: "Other Comp",
      type: "component",
      subComponents: [],
      actors: [],
      useCaseDiagrams: [],
      interfaces: [],
    })

    const content = `component "Other Comp" from root/otherComp as oc`
    const newSystem = parseUseCaseDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    const comp = newSystem.subComponents[0]
    const diagram = comp.useCaseDiagrams[0]

    // Should NOT create a new component inside comp1
    expect(comp.subComponents.find(c => c.id === "oc")).toBeUndefined()

    // Should reference the existing component
    expect(diagram.referencedNodeIds).toContain("other-comp-uuid")
  })

  it("should throw an error when 'from' path cannot be resolved (actor)", () => {
    const rootComponent = createInitialSystem()
    const content = `actor "Ghost" from nonexistent/ghost as ghost`
    expect(() =>
      parseUseCaseDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    ).toThrow('Cannot resolve actor "from" path: "nonexistent/ghost"')
  })

  it("should throw an error when 'from' path cannot be resolved (component)", () => {
    const rootComponent = createInitialSystem()
    const content = `component "Ghost" from nonexistent/ghost as ghost`
    expect(() =>
      parseUseCaseDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    ).toThrow('Cannot resolve component "from" path: "nonexistent/ghost"')
  })

  it("should throw when a use case id already exists in a different diagram of the same component", () => {
    const rootComponent = createInitialSystem()
    // Add a second diagram with a pre-existing use case id "buy"
    rootComponent.subComponents[0].useCaseDiagrams.push({
      uuid: "diagram2-uuid",
      id: "diagram2",
      name: "Diagram 2",
      type: "use-case-diagram",
      content: "",
      description: "",
      ownerComponentUuid: "comp1-uuid",
      referencedNodeIds: [],
      useCases: [
        { uuid: "buy-uuid", id: "buy", name: "Buy Item", type: "use-case", description: "", sequenceDiagrams: [] },
      ],
    })

    // Try to add a use case with id "buy" to diagram-uuid (different diagram)
    const content = `use case "Buy Something" as buy`
    expect(() =>
      parseUseCaseDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    ).toThrow('Use case id "buy" already exists in another diagram of this component')
  })

  it("should allow the same id in the same diagram (idempotent update)", () => {
    const rootComponent = createInitialSystem()
    // Pre-populate diagram-uuid with use case "buy"
    rootComponent.subComponents[0].useCaseDiagrams[0].useCases.push(
      { uuid: "buy-uuid", id: "buy", name: "Old Name", type: "use-case", description: "", sequenceDiagrams: [] },
    )

    // Re-parsing the same diagram with same id should update name, not throw
    const content = `use case "New Name" as buy`
    expect(() =>
      parseUseCaseDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    ).not.toThrow()
  })
})
