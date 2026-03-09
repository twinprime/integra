// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TreeView } from "./TreeView"
import { useSystemStore } from "../store/useSystemStore"
import type { ComponentNode } from "../store/types"
import yaml from "js-yaml"
import { serializeComponentYaml } from "../utils/systemFiles"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const initialSystem: ComponentNode = {
  uuid: "root-uuid",
  id: "root",
  name: "My System",
  type: "component",
  description: "Root",
  subComponents: [],
  actors: [],
  useCaseDiagrams: [],
  interfaces: [],
}

const loadedSystem: ComponentNode = {
  uuid: "loaded-uuid",
  id: "loaded",
  name: "Loaded System",
  type: "component",
  description: "",
  subComponents: [],
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
 * Creates a mock FileSystemDirectoryHandle that simulates a directory containing
 * the given component as a single-file tree (no subdirectory).
 */
function makeDirHandle(comp: ComponentNode) {
  const rootContent = serializeComponentYaml(comp, [])
  const writables = new Map<string, ReturnType<typeof makeWritable>>()
  const subdirWritables = new Map<string, ReturnType<typeof makeWritable>>()

  const mockSubdir: FileSystemDirectoryHandle = {
    kind: "directory",
    name: comp.id,
    values: async function* () {},
    getFileHandle: vi.fn().mockImplementation(async (name: string) => {
      const w = makeWritable()
      subdirWritables.set(name, w)
      return { kind: "file", name, createWritable: async () => w }
    }),
    removeEntry: vi.fn().mockResolvedValue(undefined),
  } as unknown as FileSystemDirectoryHandle

  const handle: FileSystemDirectoryHandle = {
    kind: "directory",
    name: "test-dir",
    values: async function* () {
      yield {
        kind: "file",
        name: `${comp.id}.yaml`,
        getFile: async () => ({ text: async () => rootContent }),
        createWritable: async () => {
          const w = makeWritable()
          writables.set(`${comp.id}.yaml`, w)
          return w
        },
      } as unknown as FileSystemFileHandle
    },
    getFileHandle: vi.fn().mockImplementation(async (name: string) => {
      const w = makeWritable()
      writables.set(name, w)
      return { kind: "file", name, createWritable: async () => w }
    }),
    getDirectoryHandle: vi.fn().mockResolvedValue(mockSubdir),
    removeEntry: vi.fn().mockResolvedValue(undefined),
  } as unknown as FileSystemDirectoryHandle

  return { handle, writables, subdirWritables, mockSubdir }
}

function resetStore() {
  useSystemStore.setState({
    rootComponent: initialSystem,
    selectedNodeId: null,
    savedSnapshot: null,
  })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("TreeView - Directory File System", () => {
  beforeEach(() => {
    localStorage.clear()
    resetStore()
    vi.stubGlobal("crypto", { randomUUID: () => "test-uuid" })
    vi.stubGlobal("alert", vi.fn())
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // ── Save ────────────────────────────────────────────────────────────────────

  describe("handleSave", () => {
    it("calls showDirectoryPicker and writes root YAML on first save", async () => {
      const { handle, writables } = makeDirHandle(initialSystem)
      vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(handle))

      render(<TreeView />)
      await userEvent.click(screen.getByTitle("Save system to YAML file"))

      await waitFor(() => expect(writables.get("root.yaml")?.write).toHaveBeenCalledOnce())
      expect(window.showDirectoryPicker).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "readwrite" }),
      )
      const written = writables.get("root.yaml")?.write.mock.calls[0][0] as string
      const parsed = yaml.load(written) as Record<string, unknown>
      expect(parsed.name).toBe("My System")
    })

    it("reuses existing directory handle on subsequent saves without showing picker again", async () => {
      const { handle } = makeDirHandle(initialSystem)
      const showDirectoryPicker = vi.fn().mockResolvedValue(handle)
      vi.stubGlobal("showDirectoryPicker", showDirectoryPicker)

      render(<TreeView />)
      const saveButton = screen.getByTitle("Save system to YAML file")

      await userEvent.click(saveButton)
      await waitFor(() => expect(handle.getFileHandle).toHaveBeenCalledTimes(1))

      await userEvent.click(saveButton)
      await waitFor(() => expect(handle.getFileHandle).toHaveBeenCalledTimes(2))

      expect(showDirectoryPicker).toHaveBeenCalledOnce()
    })

    it("silently ignores AbortError when user cancels the directory picker", async () => {
      vi.stubGlobal(
        "showDirectoryPicker",
        vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")),
      )
      const alertMock = vi.fn()
      vi.stubGlobal("alert", alertMock)

      render(<TreeView />)
      await userEvent.click(screen.getByTitle("Save system to YAML file"))

      await waitFor(() => expect(window.showDirectoryPicker).toHaveBeenCalledOnce())
      expect(alertMock).not.toHaveBeenCalled()
    })

    it("shows alert when showDirectoryPicker is unavailable", async () => {
      // Don't stub showDirectoryPicker — jsdom won't have it
      const alertMock = vi.fn()
      vi.stubGlobal("alert", alertMock)

      render(<TreeView />)
      await userEvent.click(screen.getByTitle("Save system to YAML file"))

      await waitFor(() =>
        expect(alertMock).toHaveBeenCalledWith(expect.stringContaining("Chrome or Edge")),
      )
    })
  })

  // ── Load ────────────────────────────────────────────────────────────────────

  describe("handleLoad", () => {
    it("calls showDirectoryPicker and loads a valid system into the store", async () => {
      const { handle } = makeDirHandle(loadedSystem)
      vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(handle))

      render(<TreeView />)
      await userEvent.click(screen.getByTitle("Load system from YAML file"))

      await waitFor(() =>
        expect(useSystemStore.getState().rootComponent.name).toBe("Loaded System"),
      )
    })

    it("stores dir handle after load so subsequent save reuses it", async () => {
      const { handle, writables } = makeDirHandle(loadedSystem)
      const showDirectoryPicker = vi.fn().mockResolvedValue(handle)
      vi.stubGlobal("showDirectoryPicker", showDirectoryPicker)

      render(<TreeView />)
      await userEvent.click(screen.getByTitle("Load system from YAML file"))
      await waitFor(() =>
        expect(useSystemStore.getState().rootComponent.name).toBe("Loaded System"),
      )

      await userEvent.click(screen.getByTitle("Save system to YAML file"))
      await waitFor(() => expect(writables.get("loaded.yaml")?.write).toHaveBeenCalledOnce())

      // Only one showDirectoryPicker call (shared between load and save)
      expect(showDirectoryPicker).toHaveBeenCalledOnce()
    })

    it("silently ignores AbortError when user cancels the load picker", async () => {
      vi.stubGlobal(
        "showDirectoryPicker",
        vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")),
      )
      const alertMock = vi.fn()
      vi.stubGlobal("alert", alertMock)

      render(<TreeView />)
      await userEvent.click(screen.getByTitle("Load system from YAML file"))

      await waitFor(() => expect(window.showDirectoryPicker).toHaveBeenCalledOnce())
      expect(alertMock).not.toHaveBeenCalled()
    })

    it("prompts for confirmation and aborts load when user has unsaved changes", async () => {
      const { handle } = makeDirHandle(loadedSystem)
      vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(handle))
      const confirmMock = vi.fn().mockReturnValue(false) // user cancels
      vi.stubGlobal("confirm", confirmMock)

      render(<TreeView />)

      // Wait for the mount useEffect to mark state clean
      await waitFor(() => expect(useSystemStore.getState().savedSnapshot).not.toBeNull())

      // Dirty the state
      useSystemStore.setState((state) => ({
        rootComponent: { ...state.rootComponent, name: "Modified System" },
      }))

      await userEvent.click(screen.getByTitle("Load system from YAML file"))

      await waitFor(() => expect(confirmMock).toHaveBeenCalledOnce())
      expect(window.showDirectoryPicker).not.toHaveBeenCalled()
      expect(useSystemStore.getState().rootComponent.name).toBe("Modified System")
    })

    it("shows alert when showDirectoryPicker is unavailable", async () => {
      const alertMock = vi.fn()
      vi.stubGlobal("alert", alertMock)

      render(<TreeView />)
      await userEvent.click(screen.getByTitle("Load system from YAML file"))

      await waitFor(() =>
        expect(alertMock).toHaveBeenCalledWith(expect.stringContaining("Chrome or Edge")),
      )
    })
  })
})
