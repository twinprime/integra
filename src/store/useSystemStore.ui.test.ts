// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSystemStore } from './useSystemStore'

describe('useSystemStore generated class diagram UI state', () => {
    beforeEach(() => {
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
})
