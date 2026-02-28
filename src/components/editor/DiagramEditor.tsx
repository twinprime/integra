import { useEffect, useMemo, useRef, useState } from "react"
import type { ComponentNode, DiagramNode } from "../../store/types"
import { useSystemStore, getSequenceDiagrams, type FunctionDecision } from "../../store/useSystemStore"
import { analyzeSequenceDiagramChanges, type FunctionMatch } from "../../utils/sequenceDiagramParser"
import { FunctionUpdateDialog } from "../FunctionUpdateDialog"
import { DiagramSpecPreview } from "./DiagramSpecPreview"
import { useAutoComplete, type Suggestion } from "./useAutoComplete"

const LINE_HEIGHT = 22
const TEXTAREA_PADDING = 8
const DROPDOWN_MAX_HEIGHT = 160

export const DiagramEditor = ({
  node,
  onUpdate,
}: {
  node: DiagramNode
  onUpdate: (updates: Partial<DiagramNode>) => void
}) => {
  const [name, setName] = useState(node.name || "")
  const [content, setContent] = useState(node.content || "")
  const [cursorPos, setCursorPos] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [pendingContent, setPendingContent] = useState<string | null>(null)
  const [functionMatches, setFunctionMatches] = useState<FunctionMatch[]>([])
  const [isEditing, setIsEditing] = useState(!node.content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<string[]>([node.content || ""])
  const historyIndexRef = useRef(0)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { rootComponent, applyFunctionUpdates } = useSystemStore()
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

  const { suggestions, selectedIndex, setSelectedIndex, anchorLine, dismiss, triggerNow } = useAutoComplete(
    content,
    cursorPos,
    node.type as "sequence-diagram" | "use-case-diagram",
    ownerComp,
    rootComponent,
  )

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

  const acceptSuggestion = (suggestion: Suggestion) => {
    const before = content.slice(0, suggestion.replaceFrom)
    const after = content.slice(cursorPos)
    const newContent = before + suggestion.insertText + after
    const newCursor = suggestion.replaceFrom + suggestion.insertText.length
    handleContentChange(newContent)
    dismiss()
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(newCursor, newCursor)
      setCursorPos(newCursor)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Autocomplete navigation takes priority when dropdown is visible
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex((selectedIndex + 1) % suggestions.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex((selectedIndex - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault()
        acceptSuggestion(suggestions[selectedIndex])
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        dismiss()
        return
      }
    }

    // Tab with no suggestions: trigger autocomplete immediately
    if (e.key === "Tab") {
      e.preventDefault()
      triggerNow()
      return
    }

    // Shift+Enter: save/parse without leaving edit mode
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault()
      saveContent(false)
      return
    }

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

  const saveContent = (exitEdit: boolean) => {
    if (exitEdit) setIsEditing(false)
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

  const handleContentBlur = () => saveContent(true)

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
          <div ref={containerRef} className="relative flex-1 min-h-[200px] bg-gray-950 border border-blue-400 rounded-md overflow-hidden">
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
              onChange={(e) => {
                handleContentChange(e.target.value)
                setCursorPos(e.target.selectionStart ?? 0)
              }}
              onBlur={handleContentBlur}
              onKeyDown={handleKeyDown}
              onSelect={(e) => setCursorPos(e.currentTarget.selectionStart ?? 0)}
              onScroll={(e) => {
                setScrollTop(e.currentTarget.scrollTop)
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
            {/* Autocomplete dropdown */}
            {suggestions.length > 0 && (() => {
              const lineBottom = (anchorLine + 1) * LINE_HEIGHT + TEXTAREA_PADDING - scrollTop
              const containerHeight = containerRef.current?.clientHeight ?? 0
              const showAbove = containerHeight > 0 && containerHeight - lineBottom < DROPDOWN_MAX_HEIGHT
              const top = showAbove
                ? Math.max(0, anchorLine * LINE_HEIGHT + TEXTAREA_PADDING - scrollTop - DROPDOWN_MAX_HEIGHT)
                : lineBottom
              return (
                <div
                  className="absolute z-10 bg-gray-800 border border-gray-600 rounded shadow-lg overflow-y-auto max-h-40"
                  style={{ top, left: TEXTAREA_PADDING }}
                >
                  {suggestions.map((s, i) => (
                    <div
                      key={i}
                      className={`px-3 py-1 text-xs font-mono cursor-pointer whitespace-nowrap ${
                        i === selectedIndex
                          ? "bg-blue-600 text-white"
                          : "text-gray-200 hover:bg-gray-700"
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        acceptSuggestion(s)
                      }}
                    >
                      {s.label}
                    </div>
                  ))}
                </div>
              )
            })()}
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
