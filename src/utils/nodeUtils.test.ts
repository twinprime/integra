import { describe, it, expect } from "vitest"
import { collectReferencedFunctionUuids } from "./nodeUtils"
import type { ComponentNode } from "../store/types"

describe("collectReferencedFunctionUuids", () => {
  it("finds function UUIDs referenced in a sibling component's sequence diagrams", () => {
    // Reproduces the strikethrough bug:
    // - "service" component owns an interface function (fn-uuid-1)
    // - The sequence diagram referencing it lives on the PARENT component (ownerComponent)
    // - When viewing "service" in EditorPanel, calling collectReferencedFunctionUuids(service)
    //   returns an empty set — causing the function to appear unreferenced (strikethrough)
    // - The fix: call collectReferencedFunctionUuids(rootComponent) instead

    const fnUuid = "fn-uuid-1"

    const serviceComponent: ComponentNode = {
      uuid: "service-uuid",
      id: "service",
      name: "service",
      type: "component",
      subComponents: [],
      actors: [],
      useCaseDiagrams: [],
      interfaces: [
        {
          uuid: "iface-uuid",
          id: "ServiceAPI",
          name: "ServiceAPI",
          type: "rest",
          functions: [
            {
              uuid: fnUuid,
              id: "getData",
              parameters: [],
            },
          ],
        },
      ],
    }

    const rootComponent: ComponentNode = {
      uuid: "root-uuid",
      id: "root",
      name: "Root",
      type: "component",
      actors: [],
      interfaces: [],
      subComponents: [serviceComponent],
      useCaseDiagrams: [
        {
          uuid: "uc-diagram-uuid",
          id: "uc-diagram",
          name: "UC Diagram",
          type: "use-case-diagram",
          content: "",
          description: "",
          ownerComponentUuid: "root-uuid",
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
                  uuid: "seq-diagram-uuid",
                  id: "seq-diagram",
                  name: "Sequence Diagram",
                  type: "sequence-diagram",
                  content: "",
                  description: "",
                  ownerComponentUuid: "root-uuid",
                  referencedNodeIds: [],
                  referencedFunctionUuids: [fnUuid],
                },
              ],
            },
          ],
        },
      ],
    }

    // BUG: calling on the sub-component (service) misses diagrams on the parent
    const fromService = collectReferencedFunctionUuids(serviceComponent)
    expect(fromService.has(fnUuid)).toBe(false) // demonstrates the bug scope

    // FIX: calling on the root finds all references
    const fromRoot = collectReferencedFunctionUuids(rootComponent)
    expect(fromRoot.has(fnUuid)).toBe(true)
  })

  it("finds function UUIDs referenced in deeply nested sub-component diagrams", () => {
    const fnUuid = "fn-uuid-deep"

    const serviceComponent: ComponentNode = {
      uuid: "service-uuid",
      id: "service",
      name: "service",
      type: "component",
      subComponents: [],
      actors: [],
      useCaseDiagrams: [],
      interfaces: [
        {
          uuid: "iface-uuid",
          id: "API",
          name: "API",
          type: "rest",
          functions: [{ uuid: fnUuid, id: "fn", parameters: [] }],
        },
      ],
    }

    const subOwner: ComponentNode = {
      uuid: "sub-owner-uuid",
      id: "sub-owner",
      name: "sub-owner",
      type: "component",
      actors: [],
      interfaces: [],
      subComponents: [serviceComponent],
      useCaseDiagrams: [
        {
          uuid: "uc-uuid",
          id: "uc",
          name: "UC",
          type: "use-case-diagram",
          content: "",
          description: "",
          ownerComponentUuid: "sub-owner-uuid",
          referencedNodeIds: [],
          useCases: [
            {
              uuid: "uc-node-uuid",
              id: "uc-node",
              name: "UC Node",
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
                  ownerComponentUuid: "sub-owner-uuid",
                  referencedNodeIds: [],
                  referencedFunctionUuids: [fnUuid],
                },
              ],
            },
          ],
        },
      ],
    }

    const rootComponent: ComponentNode = {
      uuid: "root-uuid",
      id: "root",
      name: "Root",
      type: "component",
      actors: [],
      interfaces: [],
      subComponents: [subOwner],
      useCaseDiagrams: [],
    }

    const result = collectReferencedFunctionUuids(rootComponent)
    expect(result.has(fnUuid)).toBe(true)
  })
})
