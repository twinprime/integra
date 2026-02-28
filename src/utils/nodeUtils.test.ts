import { describe, it, expect } from "vitest"
import { collectReferencedFunctionUuids, isUseCaseReferenced, findNodeByPath, findNearestComponentAncestor } from "./nodeUtils"
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

const buildTree = (): ComponentNode => {
  const sub: ComponentNode = {
    uuid: "sub-uuid", id: "sub", name: "Sub", type: "component",
    actors: [{ uuid: "actor-uuid", id: "leader", name: "Leader", type: "actor" }],
    subComponents: [],
    useCaseDiagrams: [{
      uuid: "diag-uuid", id: "diag", name: "Diag", type: "use-case-diagram",
      content: "", description: "", ownerComponentUuid: "sub-uuid", referencedNodeIds: [],
      useCases: [{
        uuid: "uc-uuid", id: "login", name: "Login", type: "use-case",
        description: "", sequenceDiagrams: [],
      }],
    }],
    interfaces: [],
  }
  return {
    uuid: "root-uuid", id: "root", name: "Root", type: "component",
    actors: [], interfaces: [], subComponents: [sub], useCaseDiagrams: [],
  }
}

describe("findNodeByPath", () => {
  it("resolves a bare node ID within context component", () => {
    const root = buildTree()
    const uuid = findNodeByPath(root, "leader", "sub-uuid")
    expect(uuid).toBe("actor-uuid")
  })

  it("does not find a node from a sibling component without full path", () => {
    const root = buildTree()
    // "leader" only exists in "sub", not in root
    const uuid = findNodeByPath(root, "leader", "root-uuid")
    expect(uuid).toBeNull()
  })

  it("resolves a multi-segment path: componentId/nodeId", () => {
    const root = buildTree()
    const uuid = findNodeByPath(root, "sub/leader")
    expect(uuid).toBe("actor-uuid")
  })

  it("resolves a use case within a diagram via multi-segment path", () => {
    const root = buildTree()
    const uuid = findNodeByPath(root, "sub/diag/login")
    expect(uuid).toBe("uc-uuid")
  })

  it("resolves starting from root if first segment matches root id", () => {
    const root = buildTree()
    const uuid = findNodeByPath(root, "root/sub/leader")
    expect(uuid).toBe("actor-uuid")
  })
})

describe("findNearestComponentAncestor", () => {
  it("returns the parent component for an actor", () => {
    const root = buildTree()
    const comp = findNearestComponentAncestor(root, "actor-uuid")
    expect(comp?.uuid).toBe("sub-uuid")
  })

  it("returns the parent component for a use case", () => {
    const root = buildTree()
    const comp = findNearestComponentAncestor(root, "uc-uuid")
    expect(comp?.uuid).toBe("sub-uuid")
  })

  it("returns the parent for a sub-component", () => {
    const root = buildTree()
    const comp = findNearestComponentAncestor(root, "sub-uuid")
    expect(comp?.uuid).toBe("root-uuid")
  })

  it("returns root itself when root uuid is the target", () => {
    const root = buildTree()
    const comp = findNearestComponentAncestor(root, "root-uuid")
    expect(comp?.uuid).toBe("root-uuid")
  })
})

describe("isUseCaseReferenced", () => {
  const makeSeqDiag = (referencedNodeIds: string[]) => ({
    uuid: "seq-uuid", id: "seq", name: "Seq", type: "sequence-diagram" as const,
    content: "", description: "", ownerComponentUuid: "sub-uuid", referencedNodeIds,
    referencedFunctionUuids: [],
  })

  it("returns false when no sequence diagrams reference the use case", () => {
    const root = buildTree()
    expect(isUseCaseReferenced(root, "uc-uuid")).toBe(false)
  })

  it("returns true when a sequence diagram directly references the use case", () => {
    const root = buildTree()
    const uc = root.subComponents[0].useCaseDiagrams[0].useCases[0]
    uc.sequenceDiagrams.push(makeSeqDiag(["uc-uuid"]))
    expect(isUseCaseReferenced(root, "uc-uuid")).toBe(true)
  })

  it("returns false when sequence diagram references a different uuid", () => {
    const root = buildTree()
    const uc = root.subComponents[0].useCaseDiagrams[0].useCases[0]
    uc.sequenceDiagrams.push(makeSeqDiag(["other-uuid"]))
    expect(isUseCaseReferenced(root, "uc-uuid")).toBe(false)
  })

  it("detects cross-component reference (seq diagram in root referencing use case in sub)", () => {
    const root = buildTree()
    // Add a use-case diagram to root with a seq diagram that references uc-uuid from sub
    root.useCaseDiagrams = [{
      uuid: "root-uc-diag", id: "rootDiag", name: "Root Diag", type: "use-case-diagram",
      content: "", description: "", ownerComponentUuid: "root-uuid", referencedNodeIds: [],
      useCases: [{
        uuid: "root-uc", id: "rootUc", name: "Root UC", type: "use-case",
        description: "",
        sequenceDiagrams: [makeSeqDiag(["uc-uuid"])],
      }],
    }]
    expect(isUseCaseReferenced(root, "uc-uuid")).toBe(true)
  })
})
