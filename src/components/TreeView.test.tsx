// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/require-await */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TreeView } from './TreeView'
import { useSystemStore } from '../store/useSystemStore'
import type { ComponentNode } from '../store/types'
import yaml from 'js-yaml'
import { serializeComponentYaml } from '../utils/systemFiles'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const initialSystem: ComponentNode = {
    uuid: 'root-uuid',
    id: 'root',
    name: 'My System',
    type: 'component',
    description: 'Root',
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
}

const loadedSystem: ComponentNode = {
    uuid: 'loaded-uuid',
    id: 'loaded',
    name: 'Loaded System',
    type: 'component',
    description: '',
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
}

const nestedSystem: ComponentNode = {
    uuid: 'root-uuid',
    id: 'root',
    name: 'My System',
    type: 'component',
    description: 'Root',
    subComponents: [
        {
            uuid: 'parent-uuid',
            id: 'parent',
            name: 'Parent',
            type: 'component',
            description: '',
            subComponents: [
                {
                    uuid: 'child-uuid',
                    id: 'child',
                    name: 'Child',
                    type: 'component',
                    description: '',
                    subComponents: [],
                    actors: [],
                    useCaseDiagrams: [],
                    interfaces: [],
                },
            ],
            actors: [],
            useCaseDiagrams: [],
            interfaces: [],
        },
    ],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWritable() {
    return {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
    }
}

/**
 * Creates a mock FileSystemDirectoryHandle that simulates a flat directory containing
 * the given component as root.yaml (no subdirectory).
 */
function makeDirHandle(comp: ComponentNode) {
    const rootContent = serializeComponentYaml(comp, [])
    const writables = new Map<string, ReturnType<typeof makeWritable>>()

    const handle: FileSystemDirectoryHandle = {
        kind: 'directory',
        name: 'test-dir',
        values: async function* () {
            yield {
                kind: 'file',
                name: 'root.yaml',
                getFile: async () => ({ text: async () => rootContent }),
                createWritable: async () => {
                    const w = makeWritable()
                    writables.set('root.yaml', w)
                    return w
                },
            } as unknown as FileSystemFileHandle
        },
        getFileHandle: vi.fn().mockImplementation(async (name: string) => {
            const w = makeWritable()
            writables.set(name, w)
            return { kind: 'file', name, createWritable: async () => w }
        }),
        removeEntry: vi.fn().mockResolvedValue(undefined),
    } as unknown as FileSystemDirectoryHandle

    return { handle, writables }
}

function resetStore() {
    useSystemStore.setState({
        rootComponent: initialSystem,
        selectedNodeId: null,
        savedSnapshot: null,
        uiMode: 'edit',
    })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TreeView - Directory File System', () => {
    beforeEach(() => {
        localStorage.clear()
        resetStore()
        vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' })
        vi.stubGlobal('alert', vi.fn())
        vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    // ── Save ────────────────────────────────────────────────────────────────────

    describe('handleSave', () => {
        it('calls showDirectoryPicker and writes root YAML on first save', async () => {
            const { handle, writables } = makeDirHandle(initialSystem)
            vi.stubGlobal('showDirectoryPicker', vi.fn().mockResolvedValue(handle))

            render(<TreeView />)
            await userEvent.click(screen.getByTitle('Save system to YAML file'))

            await waitFor(() => expect(writables.get('root.yaml')?.write).toHaveBeenCalledOnce())
            expect(window.showDirectoryPicker).toHaveBeenCalledWith(
                expect.objectContaining({ mode: 'readwrite' })
            )
            const written = writables.get('root.yaml')?.write.mock.calls[0][0] as string
            const parsed = yaml.load(written) as Record<string, unknown>
            expect(parsed.name).toBe('My System')
        })

        it('reuses existing directory handle on subsequent saves without showing picker again', async () => {
            const { handle } = makeDirHandle(initialSystem)
            const showDirectoryPicker = vi.fn().mockResolvedValue(handle)
            vi.stubGlobal('showDirectoryPicker', showDirectoryPicker)

            render(<TreeView />)
            const saveButton = screen.getByTitle('Save system to YAML file')

            await userEvent.click(saveButton)
            await waitFor(() => expect(handle.getFileHandle).toHaveBeenCalledTimes(1))

            await userEvent.click(saveButton)
            await waitFor(() => expect(handle.getFileHandle).toHaveBeenCalledTimes(2))

            expect(showDirectoryPicker).toHaveBeenCalledOnce()
        })

        it('re-prompts for directory on save after system is cleared', async () => {
            const { handle } = makeDirHandle(initialSystem)
            const showDirectoryPicker = vi.fn().mockResolvedValue(handle)
            vi.stubGlobal('showDirectoryPicker', showDirectoryPicker)
            vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))

            render(<TreeView />)
            const saveButton = screen.getByTitle('Save system to YAML file')

            // First save — caches the directory handle
            await userEvent.click(saveButton)
            await waitFor(() => expect(handle.getFileHandle).toHaveBeenCalledTimes(1))
            expect(showDirectoryPicker).toHaveBeenCalledOnce()

            // Clear the system
            await userEvent.click(screen.getByTitle('Clear system'))

            // Save after clear — should prompt for directory again
            await userEvent.click(saveButton)
            await waitFor(() => expect(showDirectoryPicker).toHaveBeenCalledTimes(2))
        })

        it('silently ignores AbortError when user cancels the directory picker', async () => {
            vi.stubGlobal(
                'showDirectoryPicker',
                vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'))
            )
            const alertMock = vi.fn()
            vi.stubGlobal('alert', alertMock)

            render(<TreeView />)
            await userEvent.click(screen.getByTitle('Save system to YAML file'))

            await waitFor(() => expect(window.showDirectoryPicker).toHaveBeenCalledOnce())
            expect(alertMock).not.toHaveBeenCalled()
        })

        it('shows alert when showDirectoryPicker is unavailable', async () => {
            // Don't stub showDirectoryPicker — jsdom won't have it
            const alertMock = vi.fn()
            vi.stubGlobal('alert', alertMock)

            render(<TreeView />)
            await userEvent.click(screen.getByTitle('Save system to YAML file'))

            await waitFor(() =>
                expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('Chrome or Edge'))
            )
        })
    })

    // ── Load ────────────────────────────────────────────────────────────────────

    describe('handleLoad', () => {
        it('calls showDirectoryPicker and loads a valid system into the store', async () => {
            const { handle } = makeDirHandle(loadedSystem)
            vi.stubGlobal('showDirectoryPicker', vi.fn().mockResolvedValue(handle))

            render(<TreeView />)
            await userEvent.click(screen.getByTitle('Load system from YAML file'))

            await waitFor(() =>
                expect(useSystemStore.getState().rootComponent.name).toBe('Loaded System')
            )
        })

        it('stores dir handle after load so subsequent save reuses it', async () => {
            const { handle, writables } = makeDirHandle(loadedSystem)
            const showDirectoryPicker = vi.fn().mockResolvedValue(handle)
            vi.stubGlobal('showDirectoryPicker', showDirectoryPicker)

            render(<TreeView />)
            await userEvent.click(screen.getByTitle('Load system from YAML file'))
            await waitFor(() =>
                expect(useSystemStore.getState().rootComponent.name).toBe('Loaded System')
            )

            await userEvent.click(screen.getByTitle('Save system to YAML file'))
            await waitFor(() => expect(writables.get('root.yaml')?.write).toHaveBeenCalledOnce())

            // Only one showDirectoryPicker call (shared between load and save)
            expect(showDirectoryPicker).toHaveBeenCalledOnce()
        })

        it('silently ignores AbortError when user cancels the load picker', async () => {
            vi.stubGlobal(
                'showDirectoryPicker',
                vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'))
            )
            const alertMock = vi.fn()
            vi.stubGlobal('alert', alertMock)

            render(<TreeView />)
            await userEvent.click(screen.getByTitle('Load system from YAML file'))

            await waitFor(() => expect(window.showDirectoryPicker).toHaveBeenCalledOnce())
            expect(alertMock).not.toHaveBeenCalled()
        })

        it('prompts for confirmation and aborts load when user has unsaved changes', async () => {
            const { handle } = makeDirHandle(loadedSystem)
            vi.stubGlobal('showDirectoryPicker', vi.fn().mockResolvedValue(handle))
            const confirmMock = vi.fn().mockReturnValue(false) // user cancels
            vi.stubGlobal('confirm', confirmMock)

            render(<TreeView />)

            // Wait for the mount useEffect to mark state clean
            await waitFor(() => expect(useSystemStore.getState().savedSnapshot).not.toBeNull())

            // Dirty the state
            useSystemStore.setState((state) => ({
                rootComponent: { ...state.rootComponent, name: 'Modified System' },
            }))

            await userEvent.click(screen.getByTitle('Load system from YAML file'))

            await waitFor(() => expect(confirmMock).toHaveBeenCalledOnce())
            expect(window.showDirectoryPicker).not.toHaveBeenCalled()
            expect(useSystemStore.getState().rootComponent.name).toBe('Modified System')
        })

        it('shows alert when showDirectoryPicker is unavailable', async () => {
            const alertMock = vi.fn()
            vi.stubGlobal('alert', alertMock)

            render(<TreeView />)
            await userEvent.click(screen.getByTitle('Load system from YAML file'))

            await waitFor(() =>
                expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('Chrome or Edge'))
            )
        })
    })
})

describe('TreeView node visibility', () => {
    beforeEach(() => {
        localStorage.clear()
        useSystemStore.setState({
            rootComponent: nestedSystem,
            selectedNodeId: null,
            savedSnapshot: null,
            uiMode: 'edit',
        })
    })

    it('expands collapsed ancestors and scrolls selected nodes into view after external selection changes', async () => {
        const user = userEvent.setup()
        const scrollIntoView = vi.fn()
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
            configurable: true,
            writable: true,
            value: scrollIntoView,
        })

        render(<TreeView />)

        const collapseButtons = screen.getAllByLabelText('Collapse')
        await user.click(collapseButtons[1])
        expect(screen.queryByText('Child')).not.toBeInTheDocument()

        act(() => {
            useSystemStore.setState({ selectedNodeId: 'child-uuid' })
        })

        await waitFor(() => expect(screen.getByText('Child')).toBeInTheDocument())
        expect(scrollIntoView).toHaveBeenCalled()
    })

    it('shows only the root expanded on initial load', () => {
        render(<TreeView />)

        expect(screen.getByText('Parent')).toBeInTheDocument()
        expect(screen.queryByText('Child')).not.toBeInTheDocument()
    })
})

// ─── Undo / Redo keyboard scope ───────────────────────────────────────────────

describe('TreeView — undo/redo keyboard shortcuts', () => {
    const pastSnapshot: ComponentNode = { ...initialSystem, name: 'Past State' }

    beforeEach(() => {
        useSystemStore.setState({
            rootComponent: { ...initialSystem },
            past: [pastSnapshot],
            future: [],
            uiMode: 'edit',
        })
    })

    function fireKey(target: EventTarget, key: string, { ctrlKey = false, shiftKey = false } = {}) {
        const event = new KeyboardEvent('keydown', {
            key,
            ctrlKey,
            shiftKey,
            bubbles: true,
            cancelable: true,
        })
        Object.defineProperty(event, 'target', { value: target })
        document.dispatchEvent(event)
        return event
    }

    it('applies global undo when Ctrl+Z is pressed outside the editor', async () => {
        render(<TreeView />)

        fireKey(document.body, 'z', { ctrlKey: true })

        // past should have been consumed — rootComponent switches to pastSnapshot
        const state = useSystemStore.getState()
        expect(state.past).toHaveLength(0)
        expect(state.rootComponent.name).toBe('Past State')
    })

    it('does NOT apply global undo when Ctrl+Z is pressed inside a .cm-editor element', async () => {
        render(<TreeView />)

        // Create a fake cm-editor element and append to body
        const cmEditor = document.createElement('div')
        cmEditor.className = 'cm-editor'
        const cmContent = document.createElement('div')
        cmContent.className = 'cm-content'
        cmEditor.appendChild(cmContent)
        document.body.appendChild(cmEditor)

        fireKey(cmContent, 'z', { ctrlKey: true })

        // past should be untouched — global undo was not applied
        const state = useSystemStore.getState()
        expect(state.past).toHaveLength(1)
        expect(state.rootComponent.name).toBe(initialSystem.name)

        document.body.removeChild(cmEditor)
    })

    it('does NOT apply global redo when Ctrl+Shift+Z is pressed inside a .cm-editor element', async () => {
        // Set up a future state to redo
        useSystemStore.setState({
            rootComponent: { ...initialSystem },
            past: [],
            future: [pastSnapshot],
        })

        render(<TreeView />)

        const cmEditor = document.createElement('div')
        cmEditor.className = 'cm-editor'
        const cmContent = document.createElement('div')
        cmEditor.appendChild(cmContent)
        document.body.appendChild(cmEditor)

        fireKey(cmContent, 'z', { ctrlKey: true, shiftKey: true })

        // future should be untouched — global redo was not applied
        expect(useSystemStore.getState().future).toHaveLength(1)

        document.body.removeChild(cmEditor)
    })
})
