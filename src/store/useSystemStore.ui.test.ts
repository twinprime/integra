// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSystemStore } from './useSystemStore'

describe('useSystemStore generated class diagram UI state', () => {
    beforeEach(() => {
        localStorage.clear()
        const { result } = renderHook(() => useSystemStore())
        act(() => {
            result.current.setSystem({
                uuid: 'root-component-uuid',
                id: 'root',
                name: 'My System',
                type: 'component',
                description: 'Root Component Node',
                subComponents: [],
                actors: [],
                useCaseDiagrams: [],
                interfaces: [],
            })
            result.current.setShowGeneratedClassDiagramInterfaces(true)
        })
    })

    it('defaults to showing generated class-diagram interfaces', () => {
        const { result } = renderHook(() => useSystemStore())
        expect(result.current.showGeneratedClassDiagramInterfaces).toBe(true)
    })

    it('toggles generated class-diagram interfaces in UI state', () => {
        const { result } = renderHook(() => useSystemStore())

        act(() => {
            result.current.setShowGeneratedClassDiagramInterfaces(false)
        })

        expect(result.current.showGeneratedClassDiagramInterfaces).toBe(false)
    })

    it('defaults to browse mode', () => {
        const { result } = renderHook(() => useSystemStore())

        expect(result.current.uiMode).toBe('browse')
    })

    it('toggles between browse and edit mode', () => {
        const { result } = renderHook(() => useSystemStore())

        act(() => {
            result.current.toggleUiMode()
        })

        expect(result.current.uiMode).toBe('edit')

        act(() => {
            result.current.toggleUiMode()
        })

        expect(result.current.uiMode).toBe('browse')
    })
})
