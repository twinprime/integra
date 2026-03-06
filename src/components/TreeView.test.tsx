// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TreeView } from "./TreeView"
import { useSystemStore } from "../store/useSystemStore"
import type { ComponentNode } from "../store/types"

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

const validLoadedYaml = `uuid: loaded-uuid
id: loaded
name: Loaded System
type: component
description: ''
subComponents: []
actors: []
useCaseDiagrams: []
interfaces: []
`

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWritable() {
  return {
    write: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

function makeFileHandle(content: string) {
  const writable = makeWritable()
  const handle = {
    kind: "file",
    name: "test.yaml",
    // jsdom File doesn't support .text(); use a plain mock instead
    getFile: vi.fn().mockResolvedValue({ text: () => Promise.resolve(content) }),
    createWritable: vi.fn().mockResolvedValue(writable),
  } as unknown as FileSystemFileHandle
  return { handle, writable }
}

function resetStore() {
  useSystemStore.setState({
    rootComponent: initialSystem,
    selectedNodeId: null,
    savedSnapshot: null,
  })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("TreeView - File System Access API", () => {
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
    it("calls showSaveFilePicker and writes YAML content on first save", async () => {
      const { handle, writable } = makeFileHandle("")
      vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue(handle))

      render(<TreeView />)
      await userEvent.click(screen.getByTitle("Save system to YAML file"))

      await waitFor(() => expect(writable.write).toHaveBeenCalledOnce())
      expect(window.showSaveFilePicker).toHaveBeenCalledWith(
        expect.objectContaining({ suggestedName: "my-system.yaml" }),
      )
      expect(writable.write).toHaveBeenCalledWith(expect.stringContaining("My System"))
      expect(writable.close).toHaveBeenCalledOnce()
    })

    it("reuses existing file handle on subsequent saves without showing picker again", async () => {
      const { handle, writable } = makeFileHandle("")
      const showSaveFilePicker = vi.fn().mockResolvedValue(handle)
      vi.stubGlobal("showSaveFilePicker", showSaveFilePicker)

      render(<TreeView />)
      const saveButton = screen.getByTitle("Save system to YAML file")

      await userEvent.click(saveButton)
      await waitFor(() => expect(writable.write).toHaveBeenCalledTimes(1))

      await userEvent.click(saveButton)
      await waitFor(() => expect(writable.write).toHaveBeenCalledTimes(2))

      expect(showSaveFilePicker).toHaveBeenCalledOnce()
    })

    it("silently ignores AbortError when user cancels the save picker", async () => {
      vi.stubGlobal(
        "showSaveFilePicker",
        vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")),
      )
      const alertMock = vi.fn()
      vi.stubGlobal("alert", alertMock)

      render(<TreeView />)
      await userEvent.click(screen.getByTitle("Save system to YAML file"))

      await waitFor(() => expect(window.showSaveFilePicker).toHaveBeenCalledOnce())
      expect(alertMock).not.toHaveBeenCalled()
    })

    it("shows alert for non-abort save errors", async () => {
      const { handle } = makeFileHandle("")
      handle.createWritable = vi.fn().mockRejectedValue(new Error("Disk full"))
      vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue(handle))
      const alertMock = vi.fn()
      vi.stubGlobal("alert", alertMock)

      render(<TreeView />)
      await userEvent.click(screen.getByTitle("Save system to YAML file"))

      await waitFor(() =>
        expect(alertMock).toHaveBeenCalledWith(expect.stringContaining("Disk full")),
      )
    })

    it("falls back to anchor download when File System Access API is unavailable", async () => {
      // jsdom does not define showSaveFilePicker by default
      const createObjectURL = vi
        .spyOn(URL, "createObjectURL")
        .mockReturnValue("blob:mock-url")
      const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)

      render(<TreeView />)
      await userEvent.click(screen.getByTitle("Save system to YAML file"))

      await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce())
      expect(revokeObjectURL).toHaveBeenCalledOnce()
    })
  })

  // ── Load ────────────────────────────────────────────────────────────────────

  describe("handleLoad", () => {
    it("calls showOpenFilePicker and loads a valid YAML system into the store", async () => {
      const { handle } = makeFileHandle(validLoadedYaml)
      vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([handle]))

      render(<TreeView />)
      await userEvent.click(screen.getByTitle("Load system from YAML file"))

      await waitFor(() =>
        expect(useSystemStore.getState().rootComponent.name).toBe("Loaded System"),
      )
      expect(handle.getFile).toHaveBeenCalledOnce()
    })

    it("stores file handle after load so subsequent save writes to the same file", async () => {
      const { handle: loadHandle } = makeFileHandle(validLoadedYaml)
      const saveWritable = makeWritable()
      loadHandle.createWritable = vi.fn().mockResolvedValue(saveWritable)
      vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([loadHandle]))
      const showSaveFilePicker = vi.fn()
      vi.stubGlobal("showSaveFilePicker", showSaveFilePicker)

      render(<TreeView />)

      await userEvent.click(screen.getByTitle("Load system from YAML file"))
      await waitFor(() =>
        expect(useSystemStore.getState().rootComponent.name).toBe("Loaded System"),
      )

      await userEvent.click(screen.getByTitle("Save system to YAML file"))
      await waitFor(() => expect(saveWritable.write).toHaveBeenCalledOnce())

      expect(showSaveFilePicker).not.toHaveBeenCalled()
    })

    it("silently ignores AbortError when user cancels the load picker", async () => {
      vi.stubGlobal(
        "showOpenFilePicker",
        vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")),
      )
      const alertMock = vi.fn()
      vi.stubGlobal("alert", alertMock)

      render(<TreeView />)
      await userEvent.click(screen.getByTitle("Load system from YAML file"))

      await waitFor(() => expect(window.showOpenFilePicker).toHaveBeenCalledOnce())
      expect(alertMock).not.toHaveBeenCalled()
    })

    it("shows alert and leaves store unchanged when file has invalid format", async () => {
      const { handle } = makeFileHandle("name: Not a component\ntype: actor\n")
      vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([handle]))
      const alertMock = vi.fn()
      vi.stubGlobal("alert", alertMock)

      render(<TreeView />)
      await userEvent.click(screen.getByTitle("Load system from YAML file"))

      await waitFor(() =>
        expect(alertMock).toHaveBeenCalledWith(
          expect.stringContaining("Invalid system file format"),
        ),
      )
      expect(useSystemStore.getState().rootComponent.name).toBe("My System")
    })

    it("prompts for confirmation and aborts load when user has unsaved changes", async () => {
      const { handle } = makeFileHandle(validLoadedYaml)
      vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([handle]))
      const confirmMock = vi.fn().mockReturnValue(false) // user cancels
      vi.stubGlobal("confirm", confirmMock)

      render(<TreeView />)

      // Wait for the mount useEffect to mark state clean (savedSnapshot set)
      await waitFor(() => expect(useSystemStore.getState().savedSnapshot).not.toBeNull())

      // Dirty the state by changing rootComponent without calling markSaved
      useSystemStore.setState((state) => ({
        rootComponent: { ...state.rootComponent, name: "Modified System" },
      }))

      await userEvent.click(screen.getByTitle("Load system from YAML file"))

      await waitFor(() => expect(confirmMock).toHaveBeenCalledOnce())
      expect(window.showOpenFilePicker).not.toHaveBeenCalled()
      expect(useSystemStore.getState().rootComponent.name).toBe("Modified System")
    })
  })
})
