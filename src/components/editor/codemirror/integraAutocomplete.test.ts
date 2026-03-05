/**
 * integraAutocomplete.test.ts
 *
 * Unit tests for createIntegralCompletionSource.
 * Verifies that the CM CompletionSource returns the correct suggestions and
 * `from` offset for each context type.
 */
import { describe, it, expect } from "vitest"
import { EditorState } from "@codemirror/state"
import { CompletionContext as CmCompletionContext } from "@codemirror/autocomplete"
import { createIntegralCompletionSource, type CompletionContext } from "./integraAutocomplete"
import type { ComponentNode } from "../../../store/types"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRoot(overrides: Partial<ComponentNode> = {}): ComponentNode {
  return {
    uuid: "root-uuid",
    id: "root",
    name: "Root",
    type: "component",
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
    ...overrides,
  }
}

function makeCmCtx(doc: string, pos: number, explicit = true): CmCompletionContext {
  const state = EditorState.create({ doc })
  return new CmCompletionContext(state, pos, explicit)
}

import { type CompletionResult } from "@codemirror/autocomplete"

function runCompletion(
  doc: string,
  pos: number,
  ctx: CompletionContext,
): CompletionResult | null {
  const source = createIntegralCompletionSource(() => ctx)
  const cmCtx = makeCmCtx(doc, pos)
  return source(cmCtx) as CompletionResult | null
}

// ─── No suggestions ───────────────────────────────────────────────────────────

describe("createIntegralCompletionSource — no suggestions", () => {
  it("returns null when ownerComp is null", () => {
    const result = runCompletion("ac", 2, {
      diagramType: "sequence-diagram",
      ownerComp: null,
      rootComponent: makeRoot(),
    })
    expect(result).toBeNull()
  })

  it("returns null for an unrecognised context (e.g. mid-string)", () => {
    const result = runCompletion('"partial string', 10, {
      diagramType: "sequence-diagram",
      ownerComp: makeRoot(),
      rootComponent: makeRoot(),
    })
    expect(result).toBeNull()
  })
})

// ─── Keyword suggestions ──────────────────────────────────────────────────────

describe("createIntegralCompletionSource — keyword context", () => {
  it("suggests 'actor' when line starts with 'ac'", () => {
    const result = runCompletion("ac", 2, {
      diagramType: "sequence-diagram",
      ownerComp: makeRoot(),
      rootComponent: makeRoot(),
    })
    expect(result).not.toBeNull()
    const labels = result!.options.map((o) => o.label)
    expect(labels).toContain("actor")
  })

  it("sets from to start of line for keyword replacement", () => {
    const result = runCompletion("ac", 2, {
      diagramType: "sequence-diagram",
      ownerComp: makeRoot(),
      rootComponent: makeRoot(),
    })
    expect(result!.from).toBe(0)
  })

  it("suggests 'component' when line starts with 'com'", () => {
    const result = runCompletion("com", 3, {
      diagramType: "sequence-diagram",
      ownerComp: makeRoot(),
      rootComponent: makeRoot(),
    })
    expect(result?.options.map((o) => o.label)).toContain("component")
  })

  it("suggests 'use case' for use-case diagram when line starts with 'use'", () => {
    const result = runCompletion("use", 3, {
      diagramType: "use-case-diagram",
      ownerComp: makeRoot(),
      rootComponent: makeRoot(),
    })
    expect(result?.options.map((o) => o.label)).toContain("use case")
  })
})

// ─── Entity-name (actor) suggestions ─────────────────────────────────────────

describe("createIntegralCompletionSource — entity-name context", () => {
  it("suggests actor names from ownerComp after 'actor '", () => {
    const root = makeRoot({
      actors: [{ uuid: "u1", id: "alice", name: "Alice", type: "actor" }],
    })
    const result = runCompletion("actor ", 6, {
      diagramType: "sequence-diagram",
      ownerComp: root,
      rootComponent: root,
    })
    expect(result).not.toBeNull()
    expect(result!.options.some((o) => o.label.includes("Alice"))).toBe(true)
  })

  it("sets from after the keyword + space", () => {
    const root = makeRoot({
      actors: [{ uuid: "u1", id: "alice", name: "Alice", type: "actor" }],
    })
    const doc = "actor "
    const result = runCompletion(doc, doc.length, {
      diagramType: "sequence-diagram",
      ownerComp: root,
      rootComponent: root,
    })
    expect(result!.from).toBe("actor ".length)
  })
})

// ─── Function-ref suggestions ─────────────────────────────────────────────────

describe("createIntegralCompletionSource — function-ref context", () => {
  it("suggests interface functions after 'sender --> receiver: '", () => {
    const receiver: ComponentNode = {
      uuid: "svc-uuid",
      id: "svc",
      name: "Service",
      type: "component",
      subComponents: [],
      actors: [],
      useCaseDiagrams: [],
      interfaces: [
        {
          uuid: "iface-uuid",
          id: "IFace",
          name: "IFace",
          type: "rest",
          functions: [
            {
              uuid: "fn-uuid",
              id: "doThing",
              parameters: [],
            },
          ],
        },
      ],
    }
    const root = makeRoot({ subComponents: [receiver] })
    const doc = "sender --> svc: "
    const result = runCompletion(doc, doc.length, {
      diagramType: "sequence-diagram",
      ownerComp: root,
      rootComponent: root,
    })
    expect(result).not.toBeNull()
    expect(result!.options.some((o) => o.label.includes("IFace:doThing"))).toBe(true)
  })

  it("returns null when receiver component is not found", () => {
    const root = makeRoot()
    const doc = "sender --> unknownSvc: "
    const result = runCompletion(doc, doc.length, {
      diagramType: "sequence-diagram",
      ownerComp: root,
      rootComponent: root,
    })
    // No interfaces on unknown comp → no suggestions
    expect(result).toBeNull()
  })
})

// ─── Sequence receiver suggestions ───────────────────────────────────────────

describe("createIntegralCompletionSource — seq-receiver context", () => {
  it("suggests declared IDs after '-->'", () => {
    const doc = "actor alice\nalice --> "
    const result = runCompletion(doc, doc.length, {
      diagramType: "sequence-diagram",
      ownerComp: makeRoot(),
      rootComponent: makeRoot(),
    })
    expect(result).not.toBeNull()
    expect(result!.options.some((o) => o.label === "alice")).toBe(true)
  })
})

// ─── Use-case link target suggestions ────────────────────────────────────────

describe("createIntegralCompletionSource — uc-link-target context", () => {
  it("suggests declared IDs after '-->'", () => {
    const doc = "actor user\nuser --> "
    const result = runCompletion(doc, doc.length, {
      diagramType: "use-case-diagram",
      ownerComp: makeRoot(),
      rootComponent: makeRoot(),
    })
    expect(result).not.toBeNull()
    expect(result!.options.some((o) => o.label === "user")).toBe(true)
  })
})
