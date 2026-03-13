// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useSystemStore } from "../useSystemStore"
import { HISTORY_LIMIT } from "./historySlice"
import type { ComponentNode } from "../types"

function makeNode(id: string): ComponentNode {
  return {
    uuid: id,
    id,
    name: id,
    type: "component",
    description: "",
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
  }
}

beforeEach(() => {
  useSystemStore.setState({
    rootComponent: makeNode("root"),
    past: [],
    future: [],
  })
})

describe("historySlice — future[] cap", () => {
  it("caps future[] at HISTORY_LIMIT entries after undo", () => {
    const { result } = renderHook(() => useSystemStore())

    // Fill past with HISTORY_LIMIT + 5 extra entries by directly setting state
    const nodes = Array.from({ length: HISTORY_LIMIT + 5 }, (_, i) => makeNode(`node-${i}`))
    act(() => {
      useSystemStore.setState({
        rootComponent: nodes[nodes.length - 1],
        past: nodes.slice(0, HISTORY_LIMIT + 4),
        future: [],
      })
    })

    // Each undo prepends current to future; after HISTORY_LIMIT undos the future should be capped
    for (let i = 0; i < HISTORY_LIMIT + 2; i++) {
      act(() => result.current.undo())
    }

    expect(useSystemStore.getState().future.length).toBeLessThanOrEqual(HISTORY_LIMIT)
  })

  it("undo moves current rootComponent to front of future[]", () => {
    const nodeA = makeNode("a")
    const nodeB = makeNode("b")
    act(() => {
      useSystemStore.setState({ rootComponent: nodeB, past: [nodeA], future: [] })
    })

    const { result } = renderHook(() => useSystemStore())
    act(() => result.current.undo())

    const state = useSystemStore.getState()
    expect(state.rootComponent.id).toBe("a")
    expect(state.future[0].id).toBe("b")
  })

  it("redo removes first entry from future[]", () => {
    const nodeA = makeNode("a")
    const nodeB = makeNode("b")
    act(() => {
      useSystemStore.setState({ rootComponent: nodeA, past: [], future: [nodeB] })
    })

    const { result } = renderHook(() => useSystemStore())
    act(() => result.current.redo())

    const state = useSystemStore.getState()
    expect(state.rootComponent.id).toBe("b")
    expect(state.future).toHaveLength(0)
  })
})
