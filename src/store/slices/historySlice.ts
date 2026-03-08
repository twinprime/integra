import type { ComponentNode } from "../types"
import type { StateCreator } from "zustand"
import type { SystemState } from "../useSystemStore"

export const HISTORY_LIMIT = 50

export function pushPast(past: ComponentNode[], current: ComponentNode): ComponentNode[] {
  return [...past.slice(-(HISTORY_LIMIT - 1)), current]
}

export type HistorySlice = {
  past: ComponentNode[]
  future: ComponentNode[]
  undo: () => void
  redo: () => void
}

export const createHistorySlice: StateCreator<SystemState, [], [], HistorySlice> = (set) => ({
  past: [],
  future: [],
  undo: () =>
    set((state) => {
      if (!state.past.length) return {}
      const prev = state.past[state.past.length - 1]
      return {
        rootComponent: prev,
        past: state.past.slice(0, -1),
        future: [state.rootComponent, ...state.future],
      }
    }),
  redo: () =>
    set((state) => {
      if (!state.future.length) return {}
      const next = state.future[0]
      return {
        rootComponent: next,
        past: pushPast(state.past, state.rootComponent),
        future: state.future.slice(1),
      }
    }),
})
