import { useEffect, useRef, useState } from "react"
import type { DiagramNode } from "../../store/types"
import { useSystemStore, getSequenceDiagrams, type FunctionDecision } from "../../store/useSystemStore"
import { analyzeSequenceDiagramChanges, type FunctionMatch } from "../../utils/sequenceDiagramParser"
import { FunctionUpdateDialog } from "../FunctionUpdateDialog"
import { DiagramSpecPreview } from "./DiagramSpecPreview"

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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<string[]>([node.content || ""])
  const historyIndexRef = useRef(0)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { rootComponent, applyFunctionUpdates } = useSystemStore()
  const seqDiagrams = getSequenceDiagrams(rootComponent)

  // Reset edit mode and history when switching to a different node
  useEffect(() => {
    setIsEditing(!node.content)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    historyRef.current = [node.content || ""]
    historyIndexRef.current = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.uuid])

  useEffect(() => {
    setName(node.name || "")
    setContent(node.content || "")
  }, [node.uuid, node.name, node.content])

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing) textareaRef.current?.focus()
  }, [isEditing])

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
      const truncated = historyRef.current.slice(0, historyIndexRef.current + 1)
      truncated.push(newValue)
      historyRef.current = truncated
      historyIndexRef.current = truncated.length - 1
      debounceTimerRef.current = null
    }, 500)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ctrlOrCmd = e.metaKey || e.ctrlKey
    if (ctrlOrCmd && e.key === "z" && !e.shiftKey) {
      e.preventDefault()
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      if (historyIndexRef.current > 0) {
        historyIndexRef.current--
        setContent(historyRef.current[historyIndexRef.current])
      }
    } else if (ctrlOrCmd && ((e.key === "z" && e.shiftKey) || e.key === "y")) {
      e.preventDefault()
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      if (historyIndexRef.current < historyRef.current.length - 1) {
        historyIndexRef.current++
        setContent(historyRef.current[historyIndexRef.current])
      }
    }
  }

  const handleContentBlur = () => {
    setIsEditing(false)
    if (content === node.content) return

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
        <p className="mt-1 text-sm text-gray-400">
          Usage:{" "}
          {node.type === "sequence-diagram"
            ? "Mermaid Sequence Syntax"
            : "Text / YAML"}
        </p>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Name
        </label>
        <input
          className="w-full p-2 border border-gray-700 rounded-md text-sm text-gray-100 bg-gray-900 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
        />
      </div>

      <div className="mb-4 flex-1 flex flex-col">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Specification
        </label>
        {isEditing ? (
          <div className="relative flex-1 min-h-[200px] bg-gray-950 border border-blue-400 rounded-md overflow-hidden">
            {/* Colored backdrop — non-interactive highlight layer */}
            <div ref={backdropRef} className="absolute inset-0 overflow-hidden pointer-events-none">
              <DiagramSpecPreview
                content={content}
                rootComponent={rootComponent}
                ownerComponentUuid={node.ownerComponentUuid}
                diagramType={node.type as "sequence-diagram" | "use-case-diagram"}
                mode="backdrop"
              />
            </div>
            {/* Transparent textarea on top captures all input */}
            <textarea
              ref={textareaRef}
              className={`absolute inset-0 w-full h-full p-2 text-[0.85rem] font-mono leading-relaxed bg-transparent resize-none focus:outline-none selection:bg-blue-500/30 ${content ? "text-transparent caret-white" : "text-gray-400"}`}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              onBlur={handleContentBlur}
              onKeyDown={handleKeyDown}
              onScroll={(e) => {
                if (backdropRef.current) {
                  backdropRef.current.scrollTop = e.currentTarget.scrollTop
                  backdropRef.current.scrollLeft = e.currentTarget.scrollLeft
                }
              }}
              spellCheck={false}
              placeholder={
                node.type === "sequence-diagram"
                  ? 'actor "User" as user\ncomponent "Service" as service\nuser->>service: ExplorationsAPI:createExploration(id: number)'
                  : 'actor "User" as user\nuse case "Login" as login\nuser --> login'
              }
            />
          </div>
        ) : (
          <DiagramSpecPreview
            content={content}
            rootComponent={rootComponent}
            ownerComponentUuid={node.ownerComponentUuid}
            diagramType={node.type as "sequence-diagram" | "use-case-diagram"}
            onClick={() => setIsEditing(true)}
          />
        )}
      </div>
    </div>
  )
}
