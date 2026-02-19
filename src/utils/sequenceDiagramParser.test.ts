// @vitest-environment node
import { describe, it, expect } from "vitest"
import { parseSequenceDiagram } from "./sequenceDiagramParser"
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
  })

  it("should create interfaces and interactions from messages", () => {
    const rootComponent = createInitialSystem()
    const content = `
            Client->>Server: getData(id)
         `

    const newSystem = parseSequenceDiagram(content, rootComponent, "comp1-uuid", "diagram-uuid")
    const comp = newSystem.subComponents[0]

    // Client and Server should be created as sub-components
    const server = comp.subComponents.find((c) => c.id === "Server")
    expect(server).toBeDefined()

    expect(server?.interfaces).toHaveLength(1)
    const iface = server?.interfaces[0]
    expect(iface?.name).toBe("Default")

    expect(iface?.interactions).toHaveLength(1)
    const interaction = iface?.interactions[0]
    expect(interaction?.id).toBe("getData")
    expect(interaction?.parameters).toHaveLength(1)
    expect(interaction?.parameters[0].name).toBe("id")
  })

  it("should process system-level diagrams", () => {
    const rootComponent = createInitialSystem()
    const content = `
             component "SysComponent" as SysComponent
         `
    // Parse on root level
    const newSystem = parseSequenceDiagram(content, rootComponent, "root-uuid", "diagram-uuid")

    expect(newSystem.subComponents).toHaveLength(2) // Initial 'comp1' + 'SysComponent'
    expect(
      newSystem.subComponents.find((c) => c.id === "SysComponent")
    ).toBeDefined()
  })
})
