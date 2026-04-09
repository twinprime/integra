import type { StateCreator } from 'zustand'
import type { SystemState } from '../useSystemStore'

export type UiMode = 'browse' | 'edit'

export type UiSlice = {
    uiMode: UiMode
    browseLocked: boolean
    selectedNodeId: string | null
    activeVisualizationViewId: string | null
    showGeneratedClassDiagramInterfaces: boolean
    selectedInterfaceUuid: string | null
    parseError: string | null
    savedSnapshot: string | null
    setUiMode: (mode: UiMode) => void
    toggleUiMode: () => void
    setBrowseLocked: (locked: boolean) => void
    selectNode: (nodeId: string | null) => void
    selectVisualizationView: (viewId: string | null) => void
    setShowGeneratedClassDiagramInterfaces: (show: boolean) => void
    selectInterface: (interfaceUuid: string | null) => void
    clearParseError: () => void
    markSaved: (snapshot: string) => void
}

export const createUiSlice: StateCreator<SystemState, [], [], UiSlice> = (set) => ({
    uiMode: 'browse',
    browseLocked: false,
    selectedNodeId: null,
    activeVisualizationViewId: null,
    showGeneratedClassDiagramInterfaces: true,
    selectedInterfaceUuid: null,
    parseError: null,
    savedSnapshot: null,
    setUiMode: (uiMode) => set({ uiMode }),
    toggleUiMode: () =>
        set((state) => {
            if (state.browseLocked) return {}
            return { uiMode: state.uiMode === 'browse' ? 'edit' : 'browse' }
        }),
    setBrowseLocked: (locked) => set({ browseLocked: locked }),
    selectNode: (nodeId) =>
        set((state) => {
            if (nodeId === state.selectedNodeId) return {}
            return {
                selectedNodeId: nodeId,
                activeVisualizationViewId: null,
                parseError: null,
            }
        }),
    selectVisualizationView: (viewId) => set({ activeVisualizationViewId: viewId }),
    setShowGeneratedClassDiagramInterfaces: (show) =>
        set({ showGeneratedClassDiagramInterfaces: show }),
    selectInterface: (interfaceUuid) => set({ selectedInterfaceUuid: interfaceUuid }),
    clearParseError: () => set({ parseError: null }),
    markSaved: (snapshot) => set({ savedSnapshot: snapshot }),
})
