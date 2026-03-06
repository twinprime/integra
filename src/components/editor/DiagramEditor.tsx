import { useEffect, useMemo, useRef, useState } from "react"
import type { ComponentNode, DiagramNode } from "../../store/types"
import {
  useSystemStore,
  getSequenceDiagrams,
  type FunctionDecision,
} from "../../store/useSystemStore"
import {
  analyzeSequenceDiagramChanges,
  type FunctionMatch,
} from "../../parser/sequenceDiagram/systemUpdater"
import { FunctionUpdateDialog } from "../FunctionUpdateDialog"
import { DiagramCodeMirrorEditor } from "./DiagramCodeMirrorEditor"

export const DiagramEditor = ({
  node,
  onUpdate,
}: {
  node: DiagramNode
  onUpdate: (updates: Partial<DiagramNode>) => void
}) => {
  const [name, setName] = useState(node.name || "")
  const [content, setContent] = useState(node.content || "")
  const [pendingContent, setPendingContent] = useState<string | null>(null)
  const [functionMatches, setFunctionMatches] = useState<FunctionMatch[]>([])
  const [isEditing, setIsEditing] = useState(!node.content)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    rootComponent,
    applyFunctionUpdates,
    parseError,
    clearParseError,
    selectNode,
  } = useSystemStore()
  const seqDiagrams = getSequenceDiagrams(rootComponent)

  const ownerComp = useMemo((): ComponentNode | null => {
    const walk = (c: ComponentNode): ComponentNode | null => {
      if (c.uuid === node.ownerComponentUuid) return c
      for (const sub of c.subComponents) {
        const found = walk(sub)
        if (found) return found
      }
      return null
    }
    return walk(rootComponent)
  }, [rootComponent, node.ownerComponentUuid])
  void ownerComp // used via ref in DiagramCodeMirrorEditor

  // Reset edit mode when switching to a different node
  useEffect(() => {
    setIsEditing(!node.content)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.uuid])

  useEffect(() => {
    setName(node.name || "")
    setContent(node.content || "")
  }, [node.uuid, node.name, node.content])

  const handleNameBlur = () => {
    if (name !== node.name && name.trim() !== "") {
      onUpdate({ name: name.trim() })
    } else if (name.trim() === "") {
      setName(node.name)
    }
  }

  const handleContentChange = (newValue: string) => {
    setContent(newValue)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null
    }, 500)
  }

  const saveContent = (exitEdit: boolean) => {
    if (exitEdit) setIsEditing(false)
    if (content === node.content) {
      if (parseError) clearParseError()
      return
    }

    if (node.type === "sequence-diagram") {
      const matches = analyzeSequenceDiagramChanges(
        content,
        rootComponent,
        node.uuid,
        seqDiagrams,
      )
      if (matches.length > 0) {
        setPendingContent(content)
        setFunctionMatches(matches)
        return
      }
    }

    onUpdate({ content })
  }

  const handleDialogResolve = (decisions: FunctionDecision[]): void => {
    const saved = pendingContent!
    setPendingContent(null)
    setFunctionMatches([])
    applyFunctionUpdates(decisions, node.uuid, saved)
  }

  const handleDialogCancel = (): void => {
    setContent(node.content || "")
    setPendingContent(null)
    setFunctionMatches([])
  }

  return (
    <div className="p-4 h-full flex flex-col">
      {pendingContent !== null && functionMatches.length > 0 && (
        <FunctionUpdateDialog
          matches={functionMatches}
          seqDiagrams={seqDiagrams}
          onResolve={handleDialogResolve}
          onCancel={handleDialogCancel}
        />
      )}
      <div className="mb-6 border-b border-gray-800 pb-4">
        <h2 className="text-xl font-semibold text-gray-100 flex items-center gap-2">
          {node.name}
        </h2>
      </div>

      <div className="mb-4">
        <label
          htmlFor="diagram-name-input"
          className="block text-sm font-medium text-gray-300 mb-2"
        >
          Name
        </label>
        <input
          id="diagram-name-input"
          className="w-full p-2 border border-gray-700 rounded-md text-sm text-gray-100 bg-gray-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
        />
      </div>

      <div className="mb-4 flex-1 flex flex-col min-h-0">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Specification
        </label>

        {isEditing ? (
          /* ── Edit mode: CodeMirror editable editor ── */
          <div className="flex-1 min-h-[200px] bg-gray-950 border border-blue-400 rounded-md overflow-hidden">
            <DiagramCodeMirrorEditor
              content={content}
              diagramType={node.type as "sequence-diagram" | "use-case-diagram"}
              ownerComponentUuid={node.ownerComponentUuid}
              rootComponent={rootComponent}
              readonly={false}
              onChange={handleContentChange}
              onBlur={() => saveContent(true)}
              onShiftEnter={() => saveContent(false)}
              className="h-full"
            />
          </div>
        ) : content ? (
          /* ── Preview mode: CodeMirror readonly with navigation ── */
          <div
            role="button"
            tabIndex={0}
            aria-label="Diagram specification — click to edit"
            className="w-full border border-gray-700 rounded-md bg-gray-950 cursor-text min-h-[200px] flex-1 overflow-auto focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                setIsEditing(true)
              }
            }}
          >
            <DiagramCodeMirrorEditor
              content={content}
              diagramType={node.type as "sequence-diagram" | "use-case-diagram"}
              ownerComponentUuid={node.ownerComponentUuid}
              rootComponent={rootComponent}
              readonly={true}
              onNavigate={selectNode}
              onEditRequest={() => setIsEditing(true)}
              className="h-full"
            />
          </div>
        ) : (
          /* ── Empty state: click to start editing ── */
          <div
            role="button"
            tabIndex={0}
            className="w-full p-2 border border-dashed border-gray-700 rounded-md text-sm text-gray-400 cursor-text min-h-[200px] flex-1 flex items-center justify-center italic hover:border-gray-600"
            onClick={() => setIsEditing(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                setIsEditing(true)
              }
            }}
            aria-label="Click to edit specification"
          >
            Click to edit specification…
          </div>
        )}
      </div>
    </div>
  )
}
