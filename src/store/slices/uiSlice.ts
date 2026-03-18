import type { StateCreator } from 'zustand'
import type { SystemState } from '../useSystemStore'

const NAV_HISTORY_LIMIT = 50

export type UiSlice = {
    selectedNodeId: string | null
    selectedInterfaceUuid: string | null
    parseError: string | null
    savedSnapshot: string | null
    navBack: string[]
    navForward: string[]
    canNavBack: boolean
    canNavForward: boolean
    selectNode: (nodeId: string | null) => void
    selectInterface: (interfaceUuid: string | null) => void
    goBack: () => void
    goForward: () => void
    clearParseError: () => void
    markSaved: (snapshot: string) => void
}

export const createUiSlice: StateCreator<SystemState, [], [], UiSlice> = (set) => ({
    selectedNodeId: null,
    selectedInterfaceUuid: null,
    parseError: null,
    savedSnapshot: null,
    navBack: [],
    navForward: [],
    canNavBack: false,
    canNavForward: false,
    selectNode: (nodeId) =>
        set((state) => {
            if (nodeId === state.selectedNodeId) return {}
            const newBack =
                state.selectedNodeId != null
                    ? [...state.navBack.slice(-(NAV_HISTORY_LIMIT - 1)), state.selectedNodeId]
                    : state.navBack
            return {
                selectedNodeId: nodeId,
                navBack: newBack,
                navForward: [],
                canNavBack: newBack.length > 0,
                canNavForward: false,
            }
        }),
    goBack: () =>
        set((state) => {
            if (!state.navBack.length) return {}
            const prev = state.navBack[state.navBack.length - 1]
            const newBack = state.navBack.slice(0, -1)
            const newForward =
                state.selectedNodeId != null
                    ? [state.selectedNodeId, ...state.navForward]
                    : state.navForward
            return {
                selectedNodeId: prev,
                navBack: newBack,
                navForward: newForward,
                canNavBack: newBack.length > 0,
                canNavForward: newForward.length > 0,
            }
        }),
    goForward: () =>
        set((state) => {
            if (!state.navForward.length) return {}
            const next = state.navForward[0]
            const newForward = state.navForward.slice(1)
            const newBack =
                state.selectedNodeId != null
                    ? [...state.navBack.slice(-(NAV_HISTORY_LIMIT - 1)), state.selectedNodeId]
                    : state.navBack
            return {
                selectedNodeId: next,
                navBack: newBack,
                navForward: newForward,
                canNavBack: newBack.length > 0,
                canNavForward: newForward.length > 0,
            }
        }),
    selectInterface: (interfaceUuid) => set({ selectedInterfaceUuid: interfaceUuid }),
    clearParseError: () => set({ parseError: null }),
    markSaved: (snapshot) => set({ savedSnapshot: snapshot }),
})
