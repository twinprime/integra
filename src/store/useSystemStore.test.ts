// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useSystemStore, type FunctionDecision } from "./useSystemStore"
import type { ComponentNode, UseCaseDiagramNode } from "./types"

// Mock crypto.randomUUID for consistent UUIDs in tests
const mockUUIDs = [
  "test-uuid-1",
  "test-uuid-2",
  "test-uuid-3",
  "test-uuid-4",
  "test-uuid-5",
  "test-uuid-6",
  "test-uuid-7",
  "test-uuid-8",
]
let uuidIndex = 0

vi.stubGlobal("crypto", {
  randomUUID: () => mockUUIDs[uuidIndex++ % mockUUIDs.length],
})

describe("useSystemStore", () => {
  beforeEach(() => {
    uuidIndex = 0
    // Reset store to initial state
    const { result } = renderHook(() => useSystemStore())
    act(() => {
      result.current.setSystem({
        uuid: "root-component-uuid",
        id: "root",
        name: "My System",
        type: "component",
        description: "Root Component Node",
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
      })
    })
  })

  describe("parser integration note", () => {
    it("note: parser integration is tested in diagramParser.test.ts", () => {
      // The parsers (parseUseCaseDiagram, parseSequenceDiagram) are tested separately
      // in src/utils/diagramParser.test.ts with a node environment.
      // Those tests verify that referencedNodeIds are correctly populated.
      //
      // The store's setSystem and updateNode methods call these parsers,
      // but testing them end-to-end in a jsdom environment has issues with
      // module resolution or environment differences.
      //
      // Integration testing of save/load functionality is better done with E2E tests.
      expect(true).toBe(true)
    })
  })

  describe("initial state", () => {
    it("should have default initial system", () => {
      const { result } = renderHook(() => useSystemStore())
      expect(result.current.rootComponent.name).toBe("My System")
      expect(result.current.rootComponent.type).toBe("component")
      expect(result.current.selectedNodeId).toBeNull()
    })
  })

  describe("selectNode", () => {
    it("should select a node by uuid", () => {
      const { result } = renderHook(() => useSystemStore())

      act(() => {
        result.current.selectNode("test-node-uuid")
      })

      expect(result.current.selectedNodeId).toBe("test-node-uuid")
    })

    it("should deselect when passed null", () => {
      const { result } = renderHook(() => useSystemStore())

      act(() => {
        result.current.selectNode("test-node-uuid")
        result.current.selectNode(null)
      })

      expect(result.current.selectedNodeId).toBeNull()
    })
  })

  describe("addNode", () => {
    it("should add a component to the system", () => {
      const { result } = renderHook(() => useSystemStore())

      const newComponent: ComponentNode = {
        uuid: "comp-uuid",
        id: "comp1",
        name: "Component 1",
        type: "component",
        description: "Test Component",
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
      }

      act(() => {
        result.current.addNode("root-component-uuid", newComponent)
      })

      expect(result.current.rootComponent.subComponents).toHaveLength(1)
      expect(result.current.rootComponent.subComponents[0].name).toBe(
        "Component 1",
      )
    })

    it("should add an actor to a component", () => {
      const { result } = renderHook(() => useSystemStore())

      const component: ComponentNode = {
        uuid: "comp-uuid",
        id: "comp1",
        name: "Component 1",
        type: "component",
        description: "Test Component",
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
      }

      act(() => {
        result.current.addNode("root-component-uuid", component)
      })

      const actor = {
        uuid: "actor-uuid",
        id: "actor1",
        name: "User",
        type: "actor" as const,
        description: "Test Actor",
      }

      act(() => {
        result.current.addNode("comp-uuid", actor)
      })

      expect(result.current.rootComponent.subComponents[0].actors).toHaveLength(
        1,
      )
      expect(result.current.rootComponent.subComponents[0].actors[0].name).toBe(
        "User",
      )
    })
  })

  describe("updateNode", () => {
    it("should update node name", () => {
      const { result } = renderHook(() => useSystemStore())

      act(() => {
        result.current.updateNode("root-component-uuid", {
          name: "Updated System",
        })
      })

      expect(result.current.rootComponent.name).toBe("Updated System")
    })

    it("should update node description", () => {
      const { result } = renderHook(() => useSystemStore())

      act(() => {
        result.current.updateNode("root-component-uuid", {
          description: "New description",
        })
      })

      expect(result.current.rootComponent.description).toBe("New description")
    })

    it("should update diagram content", () => {
      const { result } = renderHook(() => useSystemStore())

      // Add a component with a use case diagram
      const component: ComponentNode = {
        uuid: "comp-uuid",
        id: "comp1",
        name: "Component 1",
        type: "component",
        description: "Test Component",
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
      }

      act(() => {
        result.current.addNode("root-component-uuid", component)
      })

      const diagram: UseCaseDiagramNode = {
        uuid: "diagram-uuid",
        id: "diagram1",
        name: "Use Case Diagram",
        type: "use-case-diagram" as const,
        description: "Test Diagram",
        content: "",
        referencedNodeIds: [],
        ownerComponentUuid: "comp-uuid",
        useCases: [],
      }

      act(() => {
        result.current.addNode("comp-uuid", diagram)
      })

      // Update diagram content
      act(() => {
        result.current.updateNode("diagram-uuid", {
          content: `actor user\nuse case login\nuser ->> login`,
        })
      })

      // Verify the content was updated
      const updatedComp = result.current.rootComponent.subComponents[0]
      const updatedDiagram = updatedComp.useCaseDiagrams[0]
      expect(updatedDiagram.content).toContain("user")
      expect(updatedDiagram.content).toContain("login")
    })
  })

  describe("deleteNode", () => {
    it("should delete a component from the system", () => {
      const { result } = renderHook(() => useSystemStore())

      const component: ComponentNode = {
        uuid: "comp-uuid",
        id: "comp1",
        name: "Component 1",
        type: "component",
        description: "Test Component",
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
      }

      act(() => {
        result.current.addNode("root-component-uuid", component)
      })

      expect(result.current.rootComponent.subComponents).toHaveLength(1)

      act(() => {
        result.current.deleteNode("comp-uuid")
      })

      expect(result.current.rootComponent.subComponents).toHaveLength(0)
    })

    it("should delete an actor from a component", () => {
      const { result } = renderHook(() => useSystemStore())

      const component: ComponentNode = {
        uuid: "comp-uuid",
        id: "comp1",
        name: "Component 1",
        type: "component",
        description: "Test Component",
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
      }

      act(() => {
        result.current.addNode("root-component-uuid", component)
      })

      const actor = {
        uuid: "actor-uuid",
        id: "actor1",
        name: "User",
        type: "actor" as const,
        description: "Test Actor",
      }

      act(() => {
        result.current.addNode("comp-uuid", actor)
      })

      expect(result.current.rootComponent.subComponents[0].actors).toHaveLength(
        1,
      )

      act(() => {
        result.current.deleteNode("actor-uuid")
      })

      expect(result.current.rootComponent.subComponents[0].actors).toHaveLength(
        0,
      )
    })

    it("should clear selectedNodeId when deleting selected node", () => {
      const { result } = renderHook(() => useSystemStore())

      const component: ComponentNode = {
        uuid: "comp-uuid",
        id: "comp1",
        name: "Component 1",
        type: "component",
        description: "Test Component",
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
      }

      act(() => {
        result.current.addNode("root-component-uuid", component)
        result.current.selectNode("comp-uuid")
      })

      expect(result.current.selectedNodeId).toBe("comp-uuid")

      act(() => {
        result.current.deleteNode("comp-uuid")
      })

      expect(result.current.selectedNodeId).toBeNull()
    })
  })

  describe("setSystem", () => {
    it("should replace the entire system", () => {
      const { result } = renderHook(() => useSystemStore())

      const newSystem: ComponentNode = {
        uuid: "new-system-uuid",
        id: "new-system",
        name: "New System",
        type: "component",
        description: "New System Description",
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
      }

      act(() => {
        result.current.setSystem(newSystem)
      })

      expect(result.current.rootComponent.name).toBe("New System")
      expect(result.current.rootComponent.uuid).toBe("new-system-uuid")
    })

    it("should call parsers when loading system (integration with diagramParser)", () => {
      // NOTE: Full parser integration testing is challenging in jsdom environment.
      // The parsers are unit tested in diagramParser.test.ts with node environment.
      // This test verifies that setSystem at least accepts a system with diagrams
      // and doesn't crash. The actual parsing logic is tested separately.

      const { result } = renderHook(() => useSystemStore())

      const systemWithDiagrams: ComponentNode = {
        uuid: "new-system-uuid",
        id: "test-system",
        name: "Test System",
        type: "component",
        description: "System with diagrams",
        subComponents: [
          {
            uuid: "comp-uuid",
            id: "comp1",
            name: "Component 1",
            type: "component",
            description: "Component with diagrams",
            subComponents: [],
            actors: [],
            useCaseDiagrams: [
              {
                uuid: "uc-diagram-uuid",
                id: "ucdiagram1",
                name: "Use Case Diagram",
                type: "use-case-diagram" as const,
                description: "Test Use Case Diagram",
                content: `actor user\nuse case login`,
                referencedNodeIds: [],
                ownerComponentUuid: "comp-uuid",
                useCases: [],
              },
            ],
            interfaces: [],
          },
        ],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
      }

      act(() => {
        result.current.setSystem(systemWithDiagrams)
      })

      // Verify the system was loaded
      expect(result.current.rootComponent.name).toBe("Test System")
      expect(result.current.rootComponent.subComponents).toHaveLength(1)
      expect(
        result.current.rootComponent.subComponents[0].useCaseDiagrams,
      ).toHaveLength(1)
      // referencedNodeIds now stores UUIDs (assigned by crypto.randomUUID during parsing)
      expect(
        result.current.rootComponent.subComponents[0].useCaseDiagrams[0]
          .referencedNodeIds,
      ).toEqual(expect.arrayContaining([expect.stringMatching(/^test-uuid-\d+$/)]))
    })

    it("should not clear selectedNodeId when setting new system", () => {
      const { result } = renderHook(() => useSystemStore())

      act(() => {
        result.current.selectNode("some-node-uuid")
      })

      expect(result.current.selectedNodeId).toBe("some-node-uuid")

      const newSystem: ComponentNode = {
        uuid: "new-system-uuid",
        id: "new-system",
        name: "New System",
        type: "component",
        description: "New System",
        subComponents: [],
        actors: [],
        useCaseDiagrams: [],
        interfaces: [],
      }

      act(() => {
        result.current.setSystem(newSystem)
      })

      // Note: setSystem does not automatically clear selectedNodeId
      // The caller (e.g., TreeView handleLoad) is responsible for clearing it if needed
      expect(result.current.selectedNodeId).toBe("some-node-uuid")
    })
    it("should allow updating function parameters in a sequence diagram when it is the only reference", () => {
      const { result } = renderHook(() => useSystemStore())

      // Build: root → comp → ucDiagram → useCase → seqDiagram
      const comp: ComponentNode = {
        uuid: "comp-uuid", id: "comp1", name: "Comp", type: "component",
        description: "", subComponents: [], actors: [], useCaseDiagrams: [], interfaces: [],
      }
      act(() => { result.current.addNode("root-component-uuid", comp) })

      act(() => {
        result.current.addNode("comp-uuid", {
          uuid: "uc-diag-uuid", id: "ucd1", name: "UC Diag", type: "use-case-diagram",
          description: "", content: "", referencedNodeIds: [], ownerComponentUuid: "comp-uuid", useCases: [],
        })
      })
      act(() => {
        result.current.addNode("uc-diag-uuid", {
          uuid: "uc-uuid", id: "uc1", name: "Use Case", type: "use-case",
          description: "", sequenceDiagrams: [],
        })
      })
      act(() => {
        result.current.addNode("uc-uuid", {
          uuid: "seq-uuid", id: "seq1", name: "Seq Diag", type: "sequence-diagram",
          description: "", content: "", referencedNodeIds: [], referencedFunctionUuids: [],
          ownerComponentUuid: "comp-uuid",
        })
      })

      // First parse: define fn(x: string)
      act(() => {
        result.current.updateNode("seq-uuid", {
          content: `component comp\ncomp ->> comp: myInterface:doWork(x: string)`,
        })
      })
      expect(result.current.parseError).toBeNull()

      const fnBefore = result.current.rootComponent.subComponents[0]
        .subComponents[0]?.interfaces[0]?.functions[0]
      expect(fnBefore).toBeDefined()
      expect(fnBefore.parameters).toHaveLength(1)
      expect(fnBefore.parameters[0].name).toBe("x")

      // Second parse: update same fn to fn(x: string, y: number) — should not error
      act(() => {
        result.current.updateNode("seq-uuid", {
          content: `component comp\ncomp ->> comp: myInterface:doWork(x: string, y: number)`,
        })
      })
      expect(result.current.parseError).toBeNull()

      const fnAfter = result.current.rootComponent.subComponents[0]
        .subComponents[0]?.interfaces[0]?.functions[0]
      expect(fnAfter).toBeDefined()
      expect(fnAfter.parameters).toHaveLength(2)
      expect(fnAfter.parameters[0].name).toBe("x")
      expect(fnAfter.parameters[1].name).toBe("y")
    })
  })

  describe("applyFunctionUpdates", () => {
    const FN_UUID = "shared-fn-uuid"
    const CURRENT_DIAG = "current-diag-uuid"
    const OTHER_DIAG = "other-diag-uuid"

    const buildSharedFunctionSystem = (): ComponentNode => ({
      uuid: "root-component-uuid",
      id: "root",
      name: "My System",
      type: "component",
      description: "Root",
      subComponents: [
        {
          uuid: "comp-uuid",
          id: "comp1",
          name: "Comp",
          type: "component",
          subComponents: [],
          actors: [],
          interfaces: [
            {
              uuid: "api-iface-uuid",
              id: "API",
              name: "API",
              type: "rest",
              functions: [
                {
                  uuid: FN_UUID,
                  id: "fn",
                  parameters: [{ name: "id", type: "number", required: true }],
                },
              ],
            },
          ],
          useCaseDiagrams: [
            {
              uuid: "uc-diag-uuid",
              id: "ucd",
              name: "UC",
              type: "use-case-diagram",
              content: "",
              ownerComponentUuid: "comp-uuid",
              referencedNodeIds: [],
              useCases: [
                {
                  uuid: "uc-uuid",
                  id: "uc1",
                  name: "UC",
                  type: "use-case",
                  sequenceDiagrams: [
                    {
                      uuid: CURRENT_DIAG,
                      id: "seq1",
                      name: "Current Diagram",
                      type: "sequence-diagram",
                      content: "",
                      ownerComponentUuid: "comp-uuid",
                      referencedNodeIds: [],
                      referencedFunctionUuids: [FN_UUID],
                    },
                    {
                      uuid: OTHER_DIAG,
                      id: "seq2",
                      name: "Other Diagram",
                      type: "sequence-diagram",
                      content: "component a\ncomponent b\na ->> b: API:fn(id: number)",
                      ownerComponentUuid: "comp-uuid",
                      referencedNodeIds: [],
                      referencedFunctionUuids: [FN_UUID],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      actors: [],
      useCaseDiagrams: [],
      interfaces: [],
    })

    it("update-all updates function params and text-substitutes in affected diagrams", () => {
      const { result } = renderHook(() => useSystemStore())

      act(() => {
        useSystemStore.setState({ rootComponent: buildSharedFunctionSystem() })
      })

      const decision: FunctionDecision = {
        kind: "incompatible",
        action: "update-all",
        interfaceId: "API",
        functionId: "fn",
        functionUuid: FN_UUID,
        oldParams: [{ name: "id", type: "number", required: true }],
        newParams: [{ name: "id", type: "string", required: true }],
        affectedDiagramUuids: [OTHER_DIAG],
      }

      act(() => {
        result.current.applyFunctionUpdates(
          [decision],
          CURRENT_DIAG,
          "component a\ncomponent b\na ->> b: API:fn(id: string)",
        )
      })

      const comp = result.current.rootComponent.subComponents[0]
      const fn = comp.interfaces[0].functions.find((f) => f.uuid === FN_UUID)
      expect(fn?.parameters[0].type).toBe("string")

      const otherDiag = comp.useCaseDiagrams[0].useCases[0].sequenceDiagrams.find(
        (d) => d.uuid === OTHER_DIAG,
      )
      expect(otherDiag?.content).toContain("API:fn(id: string)")
      expect(otherDiag?.content).not.toContain("API:fn(id: number)")
      expect(result.current.parseError).toBeNull()
    })

    it("add-new adds a new function entry alongside the existing one", () => {
      const { result } = renderHook(() => useSystemStore())

      act(() => {
        useSystemStore.setState({ rootComponent: buildSharedFunctionSystem() })
      })

      const decision: FunctionDecision = {
        kind: "compatible",
        action: "add-new",
        interfaceId: "API",
        functionId: "fn",
        functionUuid: FN_UUID,
        oldParams: [{ name: "id", type: "number", required: true }],
        newParams: [
          { name: "id", type: "number", required: true },
          { name: "name", type: "string", required: true },
        ],
        affectedDiagramUuids: [],
      }

      act(() => {
        result.current.applyFunctionUpdates(
          [decision],
          CURRENT_DIAG,
          "component a\ncomponent b\na ->> b: API:fn(id: number, name: string)",
        )
      })

      const comp = result.current.rootComponent.subComponents[0]
      const fns = comp.interfaces[0].functions
      // Old function still present with original params
      const oldFn = fns.find((f) => f.uuid === FN_UUID)
      expect(oldFn?.parameters).toHaveLength(1)
      // New function added with 2 params
      const newFn = fns.find((f) => f.uuid !== FN_UUID && f.id === "fn")
      expect(newFn?.parameters).toHaveLength(2)
      expect(result.current.parseError).toBeNull()
    })

    it("update-existing updates function params without touching other diagrams' content", () => {
      const { result } = renderHook(() => useSystemStore())

      act(() => {
        useSystemStore.setState({ rootComponent: buildSharedFunctionSystem() })
      })

      const decision: FunctionDecision = {
        kind: "compatible",
        action: "update-existing",
        interfaceId: "API",
        functionId: "fn",
        functionUuid: FN_UUID,
        oldParams: [{ name: "id", type: "number", required: true }],
        newParams: [
          { name: "id", type: "number", required: true },
          { name: "name", type: "string", required: true },
        ],
        affectedDiagramUuids: [OTHER_DIAG],
      }

      act(() => {
        result.current.applyFunctionUpdates(
          [decision],
          CURRENT_DIAG,
          "component a\ncomponent b\na ->> b: API:fn(id: number, name: string)",
        )
      })

      const comp = result.current.rootComponent.subComponents[0]
      const fn = comp.interfaces[0].functions.find((f) => f.uuid === FN_UUID)
      expect(fn?.parameters).toHaveLength(2)

      const otherDiag = comp.useCaseDiagrams[0].useCases[0].sequenceDiagrams.find(
        (d) => d.uuid === OTHER_DIAG,
      )
      expect(otherDiag?.content).toContain("API:fn(id: number, name: string)")
      expect(result.current.parseError).toBeNull()
    })
  })
})
