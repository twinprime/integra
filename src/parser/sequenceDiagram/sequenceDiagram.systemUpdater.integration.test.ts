/**
 * Integration-style updater tests for sequence diagrams.
 */
import { describe, it, expect } from "vitest"
import { parseSequenceDiagram } from "./systemUpdater"
import type { ComponentNode } from "../../store/types"
import { makeComp } from "./sequenceDiagram.test.helpers"

describe("parseSequenceDiagram — out-of-scope reference", () => {
  it("throws when referencing a cousin (child of sibling)", () => {
    // Tree: root → ownerComp, sibling → cousin
    const cousin = makeComp("cousin-uuid", "cousin")
    const sibling = makeComp("sibling-uuid", "sibling", [cousin])
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp, sibling])
    // "sibling/cousin" is a cousin — out of scope
    expect(() =>
      parseSequenceDiagram("component sibling/cousin as c", root, ownerComp.uuid, "diag-uuid")
    ).toThrow("out of scope")
  })

  it("throws when referencing a deep cousin (grandchild of sibling)", () => {
    const deepCousin = makeComp("dc-uuid", "deepCousin")
    const cousin = makeComp("cousin-uuid", "cousin", [deepCousin])
    const sibling = makeComp("sibling-uuid", "sibling", [cousin])
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp, sibling])
    expect(() =>
      parseSequenceDiagram("component sibling/cousin/deepCousin as dc", root, ownerComp.uuid, "diag-uuid")
    ).toThrow("out of scope")
  })

  it("does NOT throw for a relative child reference", () => {
    const child = makeComp("child-uuid", "child")
    const ownerComp = makeComp("owner-uuid", "owner", [child])
    const root = makeComp("root-uuid", "root", [ownerComp])
    expect(() =>
      parseSequenceDiagram("component child", root, ownerComp.uuid, "diag-uuid")
    ).not.toThrow()
  })

  it("does NOT throw for a relative grandchild reference", () => {
    const grandchild = makeComp("gc-uuid", "gc")
    const child = makeComp("child-uuid", "child", [grandchild])
    const ownerComp = makeComp("owner-uuid", "owner", [child])
    const root = makeComp("root-uuid", "root", [ownerComp])
    expect(() =>
      parseSequenceDiagram("component child/gc", root, ownerComp.uuid, "diag-uuid")
    ).not.toThrow()
  })
})

describe("parseSequenceDiagram — auto-create missing path nodes", () => {
  it("auto-creates a missing sub-component when path parent exists", () => {
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp])
    // "newChild" does not yet exist under ownerComp
    const updated = parseSequenceDiagram("component owner/newChild", root, ownerComp.uuid, "diag-uuid")
    const updatedOwner = updated.subComponents.find((c) => c.uuid === ownerComp.uuid)!
    expect(updatedOwner.subComponents.some((c) => c.id === "newChild")).toBe(true)
  })

  it("auto-creates a missing actor when path parent exists", () => {
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp])
    const updated = parseSequenceDiagram("actor owner/NewUser", root, ownerComp.uuid, "diag-uuid")
    const updatedOwner = updated.subComponents.find((c) => c.uuid === ownerComp.uuid)!
    expect(updatedOwner.actors.some((a) => a.id === "NewUser")).toBe(true)
  })

  it("auto-creates intermediate component nodes when multiple segments are missing", () => {
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp])
    // "mid" and "leaf" both missing under ownerComp
    const updated = parseSequenceDiagram("component owner/mid/leaf", root, ownerComp.uuid, "diag-uuid")
    const updatedOwner = updated.subComponents.find((c) => c.uuid === ownerComp.uuid)!
    const mid = updatedOwner.subComponents.find((c) => c.id === "mid")
    expect(mid).toBeDefined()
    expect(mid!.subComponents.some((c) => c.id === "leaf")).toBe(true)
  })

  it("still throws for out-of-scope auto-create attempt (cousin path)", () => {
    const cousin = makeComp("cousin-uuid", "cousin")
    const sibling = makeComp("sibling-uuid", "sibling", [cousin])
    const ownerComp = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [ownerComp, sibling])
    // sibling/cousin/newDeepCousin would be out of scope
    expect(() =>
      parseSequenceDiagram("component sibling/cousin/newDeepCousin", root, ownerComp.uuid, "diag-uuid")
    ).toThrow()
  })
})

// ─── parseSequenceDiagram — inherited interface functions ─────────────────────

describe("parseSequenceDiagram — inherited interface functions", () => {
  const makeCompWithIfaces = (
    uuid: string,
    id: string,
    interfaces: ComponentNode["interfaces"],
    subComponents: ComponentNode[] = [],
  ): ComponentNode => ({
    uuid, id, name: id, type: "component",
    actors: [], subComponents, useCaseDiagrams: [], interfaces,
  })

  it("does NOT throw when a message references a function on an inherited interface", () => {
    // ownerComp (DataService) owns the parent interface with actual functions.
    // CheckoutService is a subComponent of ownerComp and inherits the interface.
    const parentIface = {
      uuid: "iface-parent-uuid",
      id: "DataServing",
      name: "DataServing",
      type: "rest" as const,
      functions: [{ uuid: "fn-record-uuid", id: "record", parameters: [] }],
    }
    const childIface = {
      uuid: "iface-child-uuid",
      id: "DataServing",
      name: "DataServing",
      type: "rest" as const,
      functions: [],
      parentInterfaceUuid: "iface-parent-uuid",
    }
    const checkout = makeCompWithIfaces("checkout-uuid", "CheckoutService", [childIface])
    const ownerComp = makeCompWithIfaces("owner-uuid", "DataService", [parentIface], [checkout])
    const root = makeCompWithIfaces("root-uuid", "root", [], [ownerComp])

    const content = "actor user\ncomponent CheckoutService\nuser ->> CheckoutService: DataServing:record()"
    expect(() =>
      parseSequenceDiagram(content, root, ownerComp.uuid, "diag-uuid")
    ).not.toThrow()
  })

  it("still throws when referencing a function that does not exist on the parent interface", () => {
    const parentIface = {
      uuid: "iface-parent-uuid",
      id: "DataServing",
      name: "DataServing",
      type: "rest" as const,
      functions: [{ uuid: "fn-record-uuid", id: "record", parameters: [] }],
    }
    const childIface = {
      uuid: "iface-child-uuid",
      id: "DataServing",
      name: "DataServing",
      type: "rest" as const,
      functions: [],
      parentInterfaceUuid: "iface-parent-uuid",
    }
    const checkout = makeCompWithIfaces("checkout-uuid", "CheckoutService", [childIface])
    const ownerComp = makeCompWithIfaces("owner-uuid", "DataService", [parentIface], [checkout])
    const root = makeCompWithIfaces("root-uuid", "root", [], [ownerComp])

    // "nonExistent" is not on the parent interface — should still be locked
    const content = "actor user\ncomponent CheckoutService\nuser ->> CheckoutService: DataServing:nonExistent()"
    expect(() =>
      parseSequenceDiagram(content, root, ownerComp.uuid, "diag-uuid")
    ).toThrow("locked")
  })
})

const makeCompWithIface = (
  uuid: string,
  id: string,
  subComponents: ComponentNode[] = [],
  ifaceId?: string,
  fnId?: string,
  fnUuid?: string,
): ComponentNode => {
  const interfaces = ifaceId && fnId && fnUuid
    ? [{ uuid: `${uuid}-iface`, id: ifaceId, name: ifaceId, type: "rest" as const, functions: [{ uuid: fnUuid, id: fnId, parameters: [] }] }]
    : []
  return { uuid, id, name: id, type: "component", actors: [], subComponents, useCaseDiagrams: [], interfaces }
}

describe("parseSequenceDiagram — function follows receiver", () => {
  it("adds function to new local receiver when receiver changes", () => {
    // owner has two subComponents: ServiceB (has getUser) and ServiceC (empty)
    const serviceB = makeCompWithIface("sb-uuid", "ServiceB", [], "REST", "getUser", "fn-uuid-1")
    const serviceC = makeCompWithIface("sc-uuid", "ServiceC")
    const owner = makeComp("owner-uuid", "owner", [serviceB, serviceC])
    const root = makeComp("root-uuid", "root", [owner])

    // Spec where ServiceC is now the receiver
    const result = parseSequenceDiagram(
      "component ServiceB\ncomponent ServiceC\nServiceB ->> ServiceC: REST:getUser()",
      root,
      owner.uuid,
      "diag-uuid",
    )

    const updatedOwner = result.subComponents.find((c) => c.uuid === owner.uuid)!
    const updatedC = updatedOwner.subComponents.find((c) => c.id === "ServiceC")!
    const cFn = updatedC.interfaces.find((i) => i.id === "REST")?.functions.find((f) => f.id === "getUser")
    expect(cFn).toBeDefined()
  })

  it("adds function to external (path) participant at the correct leaf component", () => {
    // Tree: root → owner → payment → ServiceB
    const serviceB = makeCompWithIface("sb-uuid", "ServiceB")
    const payment = makeComp("pay-uuid", "payment", [serviceB])
    const owner = makeComp("owner-uuid", "owner", [payment])
    const root = makeComp("root-uuid", "root", [owner])

    // "ServiceB" is declared with path payment/ServiceB; message references it by its id "ServiceB"
    const spec = "component payment/ServiceB\ncomponent gateway\ngateway ->> ServiceB: REST:getUser()"
    const result = parseSequenceDiagram(spec, root, owner.uuid, "diag-uuid")

    const updatedOwner = result.subComponents.find((c) => c.uuid === owner.uuid)!
    const updatedPayment = updatedOwner.subComponents.find((c) => c.id === "payment")!
    const updatedServiceB = updatedPayment.subComponents.find((c) => c.id === "ServiceB")!
    const fn = updatedServiceB.interfaces.find((i) => i.id === "REST")?.functions.find((f) => f.id === "getUser")
    expect(fn).toBeDefined()
  })

  it("referencedFunctionUuids points to the function on the leaf external component", () => {
    const serviceB = makeCompWithIface("sb-uuid", "ServiceB")
    const payment = makeComp("pay-uuid", "payment", [serviceB])
    const owner = makeComp("owner-uuid", "owner", [payment])
    const root = makeComp("root-uuid", "root", [owner])

    // "ServiceB" is declared with path payment/ServiceB; message references by id "ServiceB"
    const spec = "component payment/ServiceB\ncomponent gateway\ngateway ->> ServiceB: REST:getUser()"
    const result = parseSequenceDiagram(spec, root, owner.uuid, "diag-uuid")

    // Locate the function UUID on ServiceB (leaf)
    const updatedOwner = result.subComponents.find((c) => c.uuid === owner.uuid)!
    const updatedPayment = updatedOwner.subComponents.find((c) => c.id === "payment")!
    const updatedServiceB = updatedPayment.subComponents.find((c) => c.id === "ServiceB")!
    const fn = updatedServiceB.interfaces.find((i) => i.id === "REST")?.functions.find((f) => f.id === "getUser")
    expect(fn).toBeDefined()
    // Function must NOT be on the parent "payment" component
    const paymentFn = updatedPayment.interfaces.find((i) => i.id === "REST")?.functions.find((f) => f.id === "getUser")
    expect(paymentFn).toBeUndefined()
  })

  it("tracks referencedFunctionUuids per receiver when sibling components share interface and function IDs", () => {
    const diagA = {
      uuid: "diag-a-uuid", id: "diagA", name: "Diag A", type: "sequence-diagram" as const,
      ownerComponentUuid: "owner-uuid", referencedNodeIds: [], referencedFunctionUuids: [], content: "",
    }
    const diagB = {
      uuid: "diag-b-uuid", id: "diagB", name: "Diag B", type: "sequence-diagram" as const,
      ownerComponentUuid: "owner-uuid", referencedNodeIds: [], referencedFunctionUuids: [], content: "",
    }
    const useCaseDiagram = {
      uuid: "ucd-uuid", id: "ucd", name: "ucd", type: "use-case-diagram" as const,
      ownerComponentUuid: "owner-uuid", referencedNodeIds: [], content: "",
      useCases: [{
        uuid: "uc-uuid", id: "login", name: "login", type: "use-case" as const,
        sequenceDiagrams: [diagA, diagB],
      }],
    }
    const compA: ComponentNode = {
      uuid: "compa-uuid", id: "compA", name: "compA", type: "component",
      actors: [], subComponents: [], useCaseDiagrams: [],
      interfaces: [{ uuid: "ifaceA-uuid", id: "IFace", name: "IFace", type: "rest" as const, functions: [{ uuid: "fnA-uuid", id: "doWork", parameters: [] }] }],
    }
    const compB: ComponentNode = {
      uuid: "compb-uuid", id: "compB", name: "compB", type: "component",
      actors: [], subComponents: [], useCaseDiagrams: [],
      interfaces: [{ uuid: "ifaceB-uuid", id: "IFace", name: "IFace", type: "rest" as const, functions: [{ uuid: "fnB-uuid", id: "doWork", parameters: [] }] }],
    }
    const owner: ComponentNode = {
      uuid: "owner-uuid", id: "owner", name: "owner", type: "component",
      actors: [], subComponents: [compA, compB], interfaces: [], useCaseDiagrams: [useCaseDiagram],
    }
    const root = makeComp("root-uuid", "root", [owner])

    const resultA = parseSequenceDiagram(
      "component compA\ncaller ->> compA: IFace:doWork()",
      root,
      "owner-uuid",
      "diag-a-uuid",
    )
    const updatedOwnerA = resultA.subComponents.find((c) => c.uuid === "owner-uuid")!
    const updatedDiagA = updatedOwnerA.useCaseDiagrams[0].useCases[0].sequenceDiagrams.find((d) => d.uuid === "diag-a-uuid")!
    expect(updatedDiagA.referencedFunctionUuids).toEqual(["fnA-uuid"])

    const resultB = parseSequenceDiagram(
      "component compB\ncaller ->> compB: IFace:doWork()",
      root,
      "owner-uuid",
      "diag-b-uuid",
    )
    const updatedOwnerB = resultB.subComponents.find((c) => c.uuid === "owner-uuid")!
    const updatedDiagB = updatedOwnerB.useCaseDiagrams[0].useCases[0].sequenceDiagrams.find((d) => d.uuid === "diag-b-uuid")!
    expect(updatedDiagB.referencedFunctionUuids).toEqual(["fnB-uuid"])
  })
})

describe("sequence diagram block constructs — system updater", () => {
  const mkComp2 = (uuid: string, id: string, subs: ComponentNode[] = []): ComponentNode => ({
    uuid, id, name: id, type: "component",
    actors: [], subComponents: subs, useCaseDiagrams: [], interfaces: [],
  })

  it("derives interface spec from messages inside a loop block", () => {
    const child = mkComp2("child-uuid", "svc")
    const owner = mkComp2("owner-uuid", "owner", [child])
    const root = mkComp2("root-uuid", "root", [owner])
    const spec = "component svc\nactor caller\nloop retry\n  caller ->> svc: IFace:fn()\nend"
    const result = parseSequenceDiagram(spec, root, owner.uuid, "diag-uuid")
    const updatedOwner = result.subComponents.find((c) => c.uuid === owner.uuid)!
    const updatedSvc = updatedOwner.subComponents.find((c) => c.id === "svc")!
    const fn = updatedSvc.interfaces.find((i) => i.id === "IFace")?.functions.find((f) => f.id === "fn")
    expect(fn).toBeDefined()
  })

  it("derives interface spec from messages inside nested blocks", () => {
    const child = mkComp2("child-uuid", "svc")
    const owner = mkComp2("owner-uuid", "owner", [child])
    const root = mkComp2("root-uuid", "root", [owner])
    const spec = "component svc\nactor caller\nalt branch\n  loop retry\n    caller ->> svc: IFace:doWork()\n  end\nend"
    const result = parseSequenceDiagram(spec, root, owner.uuid, "diag-uuid")
    const updatedOwner = result.subComponents.find((c) => c.uuid === owner.uuid)!
    const updatedSvc = updatedOwner.subComponents.find((c) => c.id === "svc")!
    const fn = updatedSvc.interfaces.find((i) => i.id === "IFace")?.functions.find((f) => f.id === "doWork")
    expect(fn).toBeDefined()
  })
})

describe("parseSequenceDiagram — interface and function ordering", () => {
  it("sorts functions alphabetically within an interface", () => {
    const receiver = makeComp("rcv-uuid", "receiver")
    const owner = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [owner, receiver])
    // Add 3 functions in reverse alphabetical order; diagram owned by root so both participants resolve
    let updated = parseSequenceDiagram(
      "component owner\ncomponent receiver\nowner ->> receiver: API:zoo(x: string)",
      root, "root-uuid", "d1",
    )
    updated = parseSequenceDiagram(
      "component owner\ncomponent receiver\nowner ->> receiver: API:alpha(y: number)",
      updated, "root-uuid", "d2",
    )
    updated = parseSequenceDiagram(
      "component owner\ncomponent receiver\nowner ->> receiver: API:mid(z: boolean)",
      updated, "root-uuid", "d3",
    )
    const rcv = updated.subComponents.find((c) => c.uuid === "rcv-uuid")!
    const fns = rcv.interfaces[0].functions.map((f) => f.id)
    expect(fns).toEqual(["alpha", "mid", "zoo"])
  })

  it("sorts interfaces alphabetically by name when multiple are added", () => {
    const receiver = makeComp("rcv-uuid", "receiver")
    const owner = makeComp("owner-uuid", "owner")
    const root = makeComp("root-uuid", "root", [owner, receiver])
    let updated = parseSequenceDiagram(
      "component owner\ncomponent receiver\nowner ->> receiver: ZooAPI:list()",
      root, "root-uuid", "d1",
    )
    updated = parseSequenceDiagram(
      "component owner\ncomponent receiver\nowner ->> receiver: AlphaAPI:create(name: string)",
      updated, "root-uuid", "d2",
    )
    updated = parseSequenceDiagram(
      "component owner\ncomponent receiver\nowner ->> receiver: MidAPI:update(id: number)",
      updated, "root-uuid", "d3",
    )
    const rcv = updated.subComponents.find((c) => c.uuid === "rcv-uuid")!
    const ifaceIds = rcv.interfaces.map((i) => i.id)
    // Interfaces named same as id, sorted by name
    expect(ifaceIds).toEqual(["AlphaAPI", "MidAPI", "ZooAPI"])
  })
})
