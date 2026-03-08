import type { StateCreator } from "zustand"
import type { SystemState } from "../useSystemStore"

export type UiSlice = {
  selectedNodeId: string | null
  parseError: string | null
  savedSnapshot: string | null
  selectNode: (nodeId: string | null) => void
  clearParseError: () => void
  markSaved: (snapshot: string) => void
}

export const createUiSlice: StateCreator<SystemState, [], [], UiSlice> = (set) => ({
  selectedNodeId: null,
  parseError: null,
  savedSnapshot: null,
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  clearParseError: () => set({ parseError: null }),
  markSaved: (snapshot) => set({ savedSnapshot: snapshot }),
})
