import { describe, it, expect } from "vitest"
import { updateContentRefs, updateDescriptionRefs, applyIdRename } from "./renameNodeId"
import type { ComponentNode } from "../store/types"

// ─── updateContentRefs ────────────────────────────────────────────────────────

describe("updateContentRefs", () => {
  it("replaces participant alias", () => {
    expect(updateContentRefs("actor userId as customer", "customer", "user")).toBe(
      "actor userId as user",
    )
  })

  it("replaces message sender", () => {
    expect(updateContentRefs("customer->>server: foo()", "customer", "user")).toBe(
      "user->>server: foo()",
    )
  })

  it("replaces message receiver", () => {
    expect(updateContentRefs("server->>customer: bar()", "customer", "user")).toBe(
      "server->>user: bar()",
    )
  })

  it("replaces UseCase reference", () => {
    expect(updateContentRefs("UseCase:placeOrder", "placeOrder", "createOrder")).toBe(
      "UseCase:createOrder",
    )
  })

  it("replaces path segment in UseCase path reference", () => {
    expect(
      updateContentRefs("UseCase:root/recorder/rec_stream:label", "recorder", "media_recorder"),
    ).toBe("UseCase:root/media_recorder/rec_stream:label")
    // last segment (use case id) is also replaced correctly
    expect(
      updateContentRefs("UseCase:root/recorder/rec_stream", "rec_stream", "live_stream"),
    ).toBe("UseCase:root/recorder/live_stream")
  })

  it("replaces interface:function reference — interface rename", () => {
    expect(updateContentRefs("client->>api: OrdersAPI:place(a: string)", "OrdersAPI", "OrdersV2")).toBe(
      "client->>api: OrdersV2:place(a: string)",
    )
  })

  it("replaces interface:function reference — function rename", () => {
    expect(updateContentRefs("client->>api: OrdersAPI:place(a: string)", "place", "placeOrder")).toBe(
      "client->>api: OrdersAPI:placeOrder(a: string)",
    )
  })

  it("replaces id in node path declaration", () => {
    expect(updateContentRefs("actor root/customer as c", "customer", "user")).toBe(
      "actor root/user as c",
    )
  })

  it("does NOT replace partial word match", () => {
    expect(updateContentRefs("placeOrderNow->>server: foo", "place", "create")).toBe(
      "placeOrderNow->>server: foo",
    )
  })

  it("replaces all occurrences in multiline content", () => {
    const content = "actor login\nlogin->>server: go()\nserver->>login: ok()"
    const result = updateContentRefs(content, "login", "signIn")
    expect(result).toBe("actor signIn\nsignIn->>server: go()\nserver->>signIn: ok()")
  })
})

// ─── updateDescriptionRefs ───────────────────────────────────────────────────

describe("updateDescriptionRefs", () => {
  it("replaces bare ID link", () => {
    expect(updateDescriptionRefs("See [Login](login) for details", "login", "signIn")).toBe(
      "See [Login](signIn) for details",
    )
  })

  it("replaces ID as first path segment", () => {
    expect(updateDescriptionRefs("[Flow](login/main)", "login", "signIn")).toBe("[Flow](signIn/main)")
  })

  it("replaces ID as last path segment", () => {
    expect(updateDescriptionRefs("[Flow](services/login)", "login", "signIn")).toBe(
      "[Flow](services/signIn)",
    )
  })

  it("replaces ID as middle path segment", () => {
    expect(updateDescriptionRefs("[Flow](auth/login/flow)", "login", "signIn")).toBe(
      "[Flow](auth/signIn/flow)",
    )
  })

  it("does NOT replace partial segment match", () => {
    expect(updateDescriptionRefs("[Login Now](loginNow)", "login", "signIn")).toBe(
      "[Login Now](loginNow)",
    )
  })

  it("does NOT modify http links", () => {
    expect(updateDescriptionRefs("[Ext](https://login.example.com)", "login", "signIn")).toBe(
      "[Ext](https://login.example.com)",
    )
  })

  it("does NOT modify anchor links", () => {
    expect(updateDescriptionRefs("[Top](#login)", "login", "signIn")).toBe("[Top](#login)")
  })

  it("does NOT modify absolute path links", () => {
    expect(updateDescriptionRefs("[Docs](/login/docs)", "login", "signIn")).toBe(
      "[Docs](/login/docs)",
    )
  })
})

// ─── applyIdRename ────────────────────────────────────────────────────────────

const makeTree = (): ComponentNode => ({
  uuid: "root-uuid",
  id: "root",
  name: "Root",
  type: "component",
  description: "See [UC](placeOrder) for details",
  subComponents: [],
  actors: [
    {
      uuid: "actor-uuid",
      id: "customer",
      name: "Customer",
      type: "actor",
      description: "The [Place Order](placeOrder) use case",
    },
  ],
  useCaseDiagrams: [
    {
      uuid: "ucd-uuid",
      id: "mainDiag",
      name: "Main",
      type: "use-case-diagram",
      content: "actor customer\nuse case placeOrder\ncustomer --> placeOrder",
      referencedNodeIds: [],
      ownerComponentUuid: "root-uuid",
      useCases: [
        {
          uuid: "uc-uuid",
          id: "placeOrder",
          name: "Place Order",
          type: "use-case",
          description: "",
          sequenceDiagrams: [
            {
              uuid: "sd-uuid",
              id: "placeOrderFlow",
              name: "Flow",
              type: "sequence-diagram",
              content: "actor customer\ncustomer --> api: OrdersAPI:placeOrder(item: string)\ncustomer --> api: UseCase:placeOrder",
              referencedNodeIds: [],
              referencedFunctionUuids: [],
              ownerComponentUuid: "root-uuid",
            },
          ],
        },
      ],
    },
  ],
  interfaces: [
    {
      uuid: "iface-uuid",
      id: "OrdersAPI",
      name: "Orders API",
      description: "See [Flow](placeOrder/placeOrderFlow)",
      type: "rest",
      functions: [
        {
          uuid: "fn-uuid",
          id: "placeOrder",
          description: "Places an order",
          parameters: [],
        },
      ],
    },
  ],
})

describe("applyIdRename — node ID rename", () => {
  it("renames a use-case id in its own id field", () => {
    const updated = applyIdRename(makeTree(), "uc-uuid", "placeOrder", "createOrder")
    expect(updated.useCaseDiagrams[0].useCases[0].id).toBe("createOrder")
  })

  it("updates use-case id in use-case diagram content", () => {
    const updated = applyIdRename(makeTree(), "uc-uuid", "placeOrder", "createOrder")
    expect(updated.useCaseDiagrams[0].content).toContain("use case createOrder")
    expect(updated.useCaseDiagrams[0].content).not.toContain("use case placeOrder")
  })

  it("updates UseCase: reference in sequence diagram content", () => {
    const updated = applyIdRename(makeTree(), "uc-uuid", "placeOrder", "createOrder")
    expect(updated.useCaseDiagrams[0].useCases[0].sequenceDiagrams[0].content).toContain(
      "UseCase:createOrder",
    )
  })

  it("does NOT rename interface function with same id when renaming use-case", () => {
    // The function 'placeOrder' shares the name but renaming the use-case should update references
    // in content via whole-word replacement (the function reference IS updated in content).
    // The function's own id field should NOT change (different uuid).
    const updated = applyIdRename(makeTree(), "uc-uuid", "placeOrder", "createOrder")
    expect(updated.interfaces[0].functions[0].id).toBe("placeOrder")
  })

  it("updates description markdown links when renaming use-case", () => {
    const updated = applyIdRename(makeTree(), "uc-uuid", "placeOrder", "createOrder")
    expect(updated.description).toBe("See [UC](createOrder) for details")
    expect(updated.actors[0].description).toBe("The [Place Order](createOrder) use case")
  })
})

describe("applyIdRename — actor rename", () => {
  it("renames actor id", () => {
    const updated = applyIdRename(makeTree(), "actor-uuid", "customer", "buyer")
    expect(updated.actors[0].id).toBe("buyer")
  })

  it("updates actor id in use-case diagram content", () => {
    const updated = applyIdRename(makeTree(), "actor-uuid", "customer", "buyer")
    expect(updated.useCaseDiagrams[0].content).toContain("actor buyer")
    expect(updated.useCaseDiagrams[0].content).not.toContain("actor customer")
  })

  it("updates actor as message sender in sequence diagram", () => {
    const updated = applyIdRename(makeTree(), "actor-uuid", "customer", "buyer")
    const sd = updated.useCaseDiagrams[0].useCases[0].sequenceDiagrams[0]
    expect(sd.content).toContain("buyer --> api:")
    expect(sd.content).not.toContain("customer --> api:")
  })
})

describe("applyIdRename — interface ID rename", () => {
  it("renames interface id field", () => {
    const updated = applyIdRename(makeTree(), "iface-uuid", "OrdersAPI", "OrdersV2")
    expect(updated.interfaces[0].id).toBe("OrdersV2")
  })

  it("updates interface reference in sequence diagram content", () => {
    const updated = applyIdRename(makeTree(), "iface-uuid", "OrdersAPI", "OrdersV2")
    const content = updated.useCaseDiagrams[0].useCases[0].sequenceDiagrams[0].content
    expect(content).toContain("OrdersV2:placeOrder")
    expect(content).not.toContain("OrdersAPI:")
  })
})

describe("applyIdRename — function ID rename", () => {
  it("renames function id field", () => {
    const updated = applyIdRename(makeTree(), "fn-uuid", "placeOrder", "createOrder")
    expect(updated.interfaces[0].functions[0].id).toBe("createOrder")
  })

  it("updates function reference in sequence diagram content", () => {
    const updated = applyIdRename(makeTree(), "fn-uuid", "placeOrder", "createOrder")
    const content = updated.useCaseDiagrams[0].useCases[0].sequenceDiagrams[0].content
    expect(content).toContain("OrdersAPI:createOrder")
    expect(content).not.toContain("OrdersAPI:placeOrder")
  })

  it("updates description path segments when renaming function", () => {
    const updated = applyIdRename(makeTree(), "fn-uuid", "placeOrder", "createOrder")
    expect(updated.interfaces[0].description).toBe("See [Flow](createOrder/placeOrderFlow)")
  })
})
