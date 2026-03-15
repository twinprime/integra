import { useEffect, useState } from "react"
import { Download, Upload, RotateCcw, Undo2, Redo2, ArrowLeft, ArrowRight } from "lucide-react"
import { useShallow } from "zustand/shallow"
import integraLogo from "../../assets/integra-logo.svg"
import { useSystemStore } from "../../store/useSystemStore"
import type { ComponentNode } from "../../store/types"
import { saveToDirectory, loadFromDirectory } from "../../utils/systemFiles"
import yaml from "js-yaml"

const DERIVED_KEYS = new Set([
  "ownerComponentUuid",
  "referencedNodeIds",
  "referencedFunctionUuids",
])

function serializeYaml(comp: ComponentNode): string {
  return yaml.dump(
    JSON.parse(
      JSON.stringify(comp, (key: string, value: unknown): unknown =>
        DERIVED_KEYS.has(key) ? undefined : value,
      ),
    ),
    { indent: 2, noRefs: true, skipInvalid: true },
  )
}

interface TreeToolbarProps {
  /** Ref tracking whether the tree panel is "active" (for keyboard shortcuts). */
  treeActive: React.RefObject<boolean>
}

export const TreeToolbar = ({ treeActive }: TreeToolbarProps) => {
  const {
    rootComponent,
    setSystem,
    clearSystem,
    undo,
    redo,
    goBack,
    goForward,
    savedSnapshot,
    markSaved,
    canNavBack,
    canNavForward,
  } = useSystemStore(
    useShallow((s) => ({
      rootComponent: s.rootComponent,
      setSystem: s.setSystem,
      clearSystem: s.clearSystem,
      undo: s.undo,
      redo: s.redo,
      goBack: s.goBack,
      goForward: s.goForward,
      savedSnapshot: s.savedSnapshot,
      markSaved: s.markSaved,
      canNavBack: s.canNavBack,
      canNavForward: s.canNavForward,
    }))
  )
  const canUndo = useSystemStore((s) => s.past.length > 0)
  const canRedo = useSystemStore((s) => s.future.length > 0)

  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null)

  const hasUnsavedChanges =
    savedSnapshot !== null && serializeYaml(rootComponent) !== savedSnapshot

  // Initialize a clean baseline only when hydration did not restore one.
  useEffect(() => {
    if (savedSnapshot === null) {
      markSaved(serializeYaml(rootComponent))
    }
  }, [markSaved, rootComponent, savedSnapshot])

  // Keyboard shortcuts for undo/redo/nav (attached here; treeActive is passed in from TreeView)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement ||
        (e.target instanceof HTMLElement && !!e.target.closest(".cm-editor"))
      )
        return
      const mod = e.metaKey || e.ctrlKey
      if (mod && !e.shiftKey && e.key === "z") {
        e.preventDefault()
        undo()
      }
      if (mod && e.shiftKey && e.key === "z") {
        e.preventDefault()
        redo()
      }
      if (e.altKey && e.key === "ArrowLeft" && treeActive.current) {
        e.preventDefault()
        goBack()
      }
      if (e.altKey && e.key === "ArrowRight" && treeActive.current) {
        e.preventDefault()
        goForward()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [undo, redo, goBack, goForward, treeActive])

  const handleSave = async () => {
    try {
      if (!("showDirectoryPicker" in window)) {
        alert("Saving as a directory requires Chrome or Edge. Please use a supported browser.")
        return
      }
      const handle =
        dirHandle ?? (await window.showDirectoryPicker({ mode: "readwrite" }))
      await saveToDirectory(handle, rootComponent)
      setDirHandle(handle)
      markSaved(serializeYaml(rootComponent))
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        console.error("Failed to save system:", error)
        alert("Failed to save system: " + (error as Error).message)
      }
    }
  }

  const handleLoad = async () => {
    if (hasUnsavedChanges) {
      if (!confirm("You have unsaved changes. Loading a new directory will discard them. Continue?"))
        return
    }
    try {
      if (!("showDirectoryPicker" in window)) {
        alert("Loading from a directory requires Chrome or Edge. Please use a supported browser.")
        return
      }
      const handle = await window.showDirectoryPicker({ mode: "readwrite" })
      const loadedSystem = await loadFromDirectory(handle)
      setSystem(loadedSystem)
      setDirHandle(handle)
      markSaved(serializeYaml(loadedSystem))
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        console.error("Failed to load system:", error)
        alert("Failed to load system: " + (error as Error).message)
      }
    }
  }

  const handleClear = () => {
    if (hasUnsavedChanges) {
      if (!confirm("You have unsaved changes. Clearing will discard them. Continue?"))
        return
    }
    clearSystem()
    setDirHandle(null)
  }

  return (
    <div className="p-4 border-b border-gray-800 font-semibold text-gray-300 bg-gray-800/50 backdrop-blur-sm flex items-center justify-between">
      <span className="flex items-center gap-2" title="Integra">
        <img src={integraLogo} width={18} height={18} alt="Integra" />
        {hasUnsavedChanges && (
          <span className="text-xs font-normal text-yellow-500" title="Unsaved changes">
            ●
          </span>
        )}
      </span>
      <div className="flex gap-1">
        <button
          onClick={goBack}
          disabled={!canNavBack}
          className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Go back (Alt+←)"
        >
          <ArrowLeft size={16} />
        </button>
        <button
          onClick={goForward}
          disabled={!canNavForward}
          className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Go forward (Alt+→)"
        >
          <ArrowRight size={16} />
        </button>
        <button
          onClick={undo}
          disabled={!canUndo}
          className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Undo (Cmd+Z)"
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Redo (Cmd+Shift+Z)"
        >
          <Redo2 size={16} />
        </button>
        <button
          onClick={() => { void handleSave() }}
          className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
          title="Save system to YAML file"
        >
          <Download size={16} />
        </button>
        <button
          onClick={() => { void handleLoad() }}
          className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
          title="Load system from YAML file"
        >
          <Upload size={16} />
        </button>
        <button
          onClick={handleClear}
          className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-red-400 transition-colors"
          title="Clear system"
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  )
}
