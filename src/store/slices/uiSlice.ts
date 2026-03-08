import type { StateCreator } from "zustand"
import type { SystemState } from "../useSystemStore"

export type UiSlice = {
  selectedNodeId: string | null
  selectedInterfaceUuid: string | null
  parseError: string | null
  savedSnapshot: string | null
  selectNode: (nodeId: string | null) => void
  selectInterface: (interfaceUuid: string | null) => void
  clearParseError: () => void
  markSaved: (snapshot: string) => void
}

export const createUiSlice: StateCreator<SystemState, [], [], UiSlice> = (set) => ({
  selectedNodeId: null,
  selectedInterfaceUuid: null,
  parseError: null,
  savedSnapshot: null,
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  selectInterface: (interfaceUuid) => set({ selectedInterfaceUuid: interfaceUuid }),
  clearParseError: () => set({ parseError: null }),
  markSaved: (snapshot) => set({ savedSnapshot: snapshot }),
})
