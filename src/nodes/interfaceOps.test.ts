import { describe, it, expect } from "vitest"
import { updateFunctionParams, addFunctionToInterface } from "./interfaceOps"
import type { ComponentNode } from "../store/types"

const FN_UUID = "fn-uuid"

const buildComp = (): ComponentNode => ({
  uuid: "comp-uuid",
  id: "comp",
  name: "Comp",
  type: "component",
  description: "",
  subComponents: [],
  actors: [],
  useCaseDiagrams: [],
  interfaces: [
    {
      uuid: "iface-uuid",
      id: "API",
      name: "API",
      type: "rest",
      functions: [
        {
          uuid: FN_UUID,
          id: "fn",
          description: "Does something useful",
          parameters: [
            { name: "id", type: "number", required: true, description: "The entity ID" },
            { name: "name", type: "string", required: true, description: "The entity name" },
          ],
        },
      ],
    },
  ],
})

// ─── updateFunctionParams ─────────────────────────────────────────────────────

describe("updateFunctionParams", () => {
  it("preserves function-level description", () => {
    const comp = buildComp()
    const result = updateFunctionParams(comp, FN_UUID, [
      { name: "id", type: "string", required: true },
    ])
    const fn = result.interfaces[0].functions[0]
    expect(fn.description).toBe("Does something useful")
  })

  it("preserves parameter descriptions for params whose names match", () => {
    const comp = buildComp()
    // Update type of 'id', keep 'name', add new 'extra'
    const result = updateFunctionParams(comp, FN_UUID, [
      { name: "id", type: "string", required: true },
      { name: "name", type: "string", required: false },
      { name: "extra", type: "boolean", required: false },
    ])
    const params = result.interfaces[0].functions[0].parameters
    expect(params[0].description).toBe("The entity ID")
    expect(params[1].description).toBe("The entity name")
    expect(params[2].description).toBeUndefined()
  })

  it("does not add a description to params with no matching name", () => {
    const comp = buildComp()
    const result = updateFunctionParams(comp, FN_UUID, [
      { name: "newParam", type: "string", required: true },
    ])
    const params = result.interfaces[0].functions[0].parameters
    expect(params[0].description).toBeUndefined()
  })

  it("leaves unrelated functions unchanged", () => {
    const comp = buildComp()
    const result = updateFunctionParams(comp, "nonexistent-uuid", [
      { name: "x", type: "number", required: true },
    ])
    expect(result).toEqual(comp)
  })

  it("recurses into subComponents", () => {
    const root: ComponentNode = {
      uuid: "root-uuid",
      id: "root",
      name: "Root",
      type: "component",
      description: "",
      actors: [],
      useCaseDiagrams: [],
      interfaces: [],
      subComponents: [buildComp()],
    }
    const result = updateFunctionParams(root, FN_UUID, [
      { name: "id", type: "string", required: true },
    ])
    const fn = result.subComponents[0].interfaces[0].functions[0]
    expect(fn.description).toBe("Does something useful")
    expect(fn.parameters[0].description).toBe("The entity ID")
  })
})

// ─── addFunctionToInterface ───────────────────────────────────────────────────

describe("addFunctionToInterface", () => {
  it("copies function description from the original function", () => {
    const comp = buildComp()
    const result = addFunctionToInterface(comp, FN_UUID, "fn", [
      { name: "id", type: "number", required: true },
      { name: "name", type: "string", required: true },
      { name: "extra", type: "string", required: false },
    ])
    const fns = result.interfaces[0].functions
    expect(fns).toHaveLength(2)
    const newFn = fns[1]
    expect(newFn.description).toBe("Does something useful")
  })

  it("copies parameter descriptions for params whose names match", () => {
    const comp = buildComp()
    const result = addFunctionToInterface(comp, FN_UUID, "fn", [
      { name: "id", type: "number", required: true },
      { name: "name", type: "string", required: true },
      { name: "extra", type: "string", required: false },
    ])
    const params = result.interfaces[0].functions[1].parameters
    expect(params[0].description).toBe("The entity ID")
    expect(params[1].description).toBe("The entity name")
    expect(params[2].description).toBeUndefined()
  })

  it("does not include a description key when original has no description", () => {
    const comp = buildComp()
    // Remove description from the original function
    comp.interfaces[0].functions[0] = { ...comp.interfaces[0].functions[0], description: undefined }
    const result = addFunctionToInterface(comp, FN_UUID, "fn", [
      { name: "id", type: "number", required: true },
    ])
    const newFn = result.interfaces[0].functions[1]
    expect(newFn.description).toBeUndefined()
  })

  it("keeps the original function unchanged", () => {
    const comp = buildComp()
    const result = addFunctionToInterface(comp, FN_UUID, "fn", [
      { name: "id", type: "number", required: true },
    ])
    const originalFn = result.interfaces[0].functions[0]
    expect(originalFn.uuid).toBe(FN_UUID)
    expect(originalFn.description).toBe("Does something useful")
    expect(originalFn.parameters).toHaveLength(2)
  })

  it("recurses into subComponents", () => {
    const root: ComponentNode = {
      uuid: "root-uuid",
      id: "root",
      name: "Root",
      type: "component",
      description: "",
      actors: [],
      useCaseDiagrams: [],
      interfaces: [],
      subComponents: [buildComp()],
    }
    const result = addFunctionToInterface(root, FN_UUID, "fn", [
      { name: "id", type: "number", required: true },
    ])
    const fns = result.subComponents[0].interfaces[0].functions
    expect(fns).toHaveLength(2)
    expect(fns[1].description).toBe("Does something useful")
  })
})
