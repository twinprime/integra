// @vitest-environment node
import { describe, it, expect } from "vitest"
import { parseUseCaseDiagram, parseSequenceDiagram } from "./diagramParser"
import type { SystemNode } from "../store/types"

// Mock system
const createInitialSystem = (): SystemNode => ({
  id: "root",
  name: "Root",
  type: "system",
  components: [
    {
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
})

describe("diagramParser", () => {
  describe("parseUseCaseDiagram", () => {
    it("should add actors and use cases to the component", () => {
      const system = createInitialSystem()
      const content = `
                actor "Customer" as cust
                use case "Buy Item" as buy
                cust --> buy
            `

      const newSystem = parseUseCaseDiagram(content, system, "comp1")
      const comp = newSystem.components[0]

      expect(comp.actors).toHaveLength(1)
      expect(comp.actors[0].id).toBe("cust")
      expect(comp.actors[0].name).toBe("Customer")

      expect(comp.useCases).toHaveLength(1)
      expect(comp.useCases[0].id).toBe("buy")
      expect(comp.useCases[0].name).toBe("Buy Item")
    })

    it("should update existing entities", () => {
      const system = createInitialSystem()
      system.components[0].actors.push({
        id: "cust",
        name: "Old Name",
        type: "actor",
      })

      const content = `actor "New Name" as cust`
      const newSystem = parseUseCaseDiagram(content, system, "comp1")
      const comp = newSystem.components[0]

      expect(comp.actors[0].name).toBe("New Name")
    })
  })

  describe("parseSequenceDiagram", () => {
    it("should create participants as sub-components", () => {
      // ... existing test ...
      const system = createInitialSystem()
      const content = `
                participant Alice
                participant Bob@{"type": "actor"}
            `

      const newSystem = parseSequenceDiagram(content, system, "comp1")
      const comp = newSystem.components[0]

      expect(comp.subComponents).toHaveLength(1)
      expect(comp.subComponents[0].id).toBe("Alice")

      expect(comp.actors).toHaveLength(1)
      expect(comp.actors[0].id).toBe("Bob")
    })

    it("should create interfaces and interactions from messages", () => {
      // ... existing test ...
      const system = createInitialSystem()
      const content = `
                Client->>Server: getData(id)
             `

      const newSystem = parseSequenceDiagram(content, system, "comp1")
      const comp = newSystem.components[0]

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
      const system = createInitialSystem()
      const content = `
                 participant "SysComponent"
             `
      // Parse on HEAD system
      const newSystem = parseSequenceDiagram(content, system, "root")

      expect(newSystem.components).toHaveLength(2) // Initial 'comp1' + 'SysComponent'
      expect(
        newSystem.components.find((c) => c.id === "SysComponent")
      ).toBeDefined()
    })
  })
})
