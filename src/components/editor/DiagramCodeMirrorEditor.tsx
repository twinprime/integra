/**
 * DiagramCodeMirrorEditor.tsx
 *
 * React wrapper around a CodeMirror 6 EditorView for Integra diagram
 * specification editing.  Handles both editable and read-only (preview) modes.
 *
 * In readonly mode the editor displays highlighted, navigable tokens; clicking
 * a navigable token (identifier or function reference with a resolved UUID)
 * calls `onNavigate(uuid)`.  Clicking the container itself calls `onEditRequest`
 * so the parent can switch to edit mode.
 *
 * In edit mode the editor is a fully functional CodeMirror editor with syntax
 * highlighting, autocomplete, and CodeMirror's built-in undo/redo.
 */
import { useEffect, useRef, useMemo } from "react"
import { EditorState, Compartment, Prec, type Extension } from "@codemirror/state"
import { EditorView, keymap, ViewPlugin, type ViewUpdate } from "@codemirror/view"
import { history, historyKeymap, defaultKeymap, indentWithTab } from "@codemirror/commands"
import { closeBrackets } from "@codemirror/autocomplete"
import { indentUnit } from "@codemirror/language"
import type { ComponentNode } from "../../store/types"
import {
  integraLanguage,
  integraCmField,
  setDiagramContext,
  navMapFromView,
  type DiagramContext,
  type AnnotatedSeg,
} from "./codemirror/integraLanguage"
import { integraTheme, integraLinkCursorTheme } from "./codemirror/integraTheme"
import { integraAutocomplete, type CompletionContext } from "./codemirror/integraAutocomplete"

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DiagramCodeMirrorEditorProps {
  content: string
  diagramType: "sequence-diagram" | "use-case-diagram"
  ownerComponentUuid: string
  rootComponent: ComponentNode
  readonly: boolean
  /** Called with the updated document string on every change (edit mode only) */
  onChange?: (value: string) => void
  /** Called on blur (edit mode) — parent should decide whether to save */
  onBlur?: () => void
  /** Called when Shift+Enter is pressed in edit mode */
  onShiftEnter?: () => void
  /** Called when user clicks a navigable token in readonly mode */
  onNavigate?: (uuid: string, ifaceUuid?: string) => void
  /** Called when user clicks the readonly editor to request edit mode */
  onEditRequest?: () => void
  className?: string
}

// ─── Navigation ViewPlugin ────────────────────────────────────────────────────

function makeNavPlugin(onNavigate: (uuid: string, ifaceUuid?: string) => void, onEditRequest: () => void) {
  return ViewPlugin.define(() => ({}), {
    eventHandlers: {
      mousedown(event, view) {
        // In readonly mode the editor is not focusable via normal means — check
        // if the state is readonly and if the user clicked a navigable token.
        if (!view.state.readOnly) return

        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos == null) {
          onEditRequest()
          return
        }

        const navMap = navMapFromView(view)
        const entry = navMap.find((n: AnnotatedSeg) => pos >= n.from && pos < n.to)
        if (entry?.uuid) {
          event.preventDefault()
          event.stopPropagation()
          onNavigate(entry.uuid, entry.ifaceUuid)
        } else {
          onEditRequest()
        }
      },
    },
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DiagramCodeMirrorEditor({
  content,
  diagramType,
  ownerComponentUuid,
  rootComponent,
  readonly,
  onChange,
  onBlur,
  onShiftEnter,
  onNavigate,
  onEditRequest,
  className,
}: DiagramCodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  // Refs so the extension closures always read the latest prop values
  const onChangeRef = useRef(onChange)
  const onBlurRef = useRef(onBlur)
  const onShiftEnterRef = useRef(onShiftEnter)
  const onNavigateRef = useRef(onNavigate)
  const onEditRequestRef = useRef(onEditRequest)
  const ownerCompRef = useRef<ComponentNode | null>(null)
  const rootComponentRef = useRef(rootComponent)
  const diagramTypeRef = useRef(diagramType)

  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { onBlurRef.current = onBlur }, [onBlur])
  useEffect(() => { onShiftEnterRef.current = onShiftEnter }, [onShiftEnter])
  useEffect(() => { onNavigateRef.current = onNavigate }, [onNavigate])
  useEffect(() => { onEditRequestRef.current = onEditRequest }, [onEditRequest])

  // Resolve ownerComp from rootComponent + ownerComponentUuid
  const ownerComp = useMemo((): ComponentNode | null => {
    const walk = (c: ComponentNode): ComponentNode | null => {
      if (c.uuid === ownerComponentUuid) return c
      for (const sub of c.subComponents) {
        const found = walk(sub)
        if (found) return found
      }
      return null
    }
    return walk(rootComponent)
  }, [rootComponent, ownerComponentUuid])

  useEffect(() => { ownerCompRef.current = ownerComp }, [ownerComp])
  useEffect(() => { rootComponentRef.current = rootComponent }, [rootComponent])
  useEffect(() => { diagramTypeRef.current = diagramType }, [diagramType])

  // Compartments for runtime reconfiguration
  const readOnlyCompartment = useRef(new Compartment())
  const linkCursorCompartment = useRef(new Compartment())

  // ── Create EditorView once on mount ────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return

    const getCompletionContext = (): CompletionContext => ({
      diagramType: diagramTypeRef.current,
      ownerComp: ownerCompRef.current,
      rootComponent: rootComponentRef.current,
    })

    const shiftEnterKeymap = keymap.of([
      {
        key: "Shift-Enter",
        run() {
          onShiftEnterRef.current?.()
          return true
        },
      },
    ])

    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        onChangeRef.current?.(update.state.doc.toString())
      }
      // Detect focus → blur transition
      if (update.focusChanged && !update.view.hasFocus) {
        onBlurRef.current?.()
      }
    })

    const navPlugin = makeNavPlugin(
      (uuid, ifaceUuid) => onNavigateRef.current?.(uuid, ifaceUuid),
      () => onEditRequestRef.current?.(),
    )

    const extensions: Extension[] = [
      integraLanguage,
      integraTheme,
      integraAutocomplete(getCompletionContext),
      history(),
      closeBrackets(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      indentUnit.of("  "),
      Prec.highest(shiftEnterKeymap),
      updateListener,
      navPlugin,
      readOnlyCompartment.current.of(EditorState.readOnly.of(readonly)),
      linkCursorCompartment.current.of(readonly ? integraLinkCursorTheme : []),
      EditorView.lineWrapping,
    ]

    const state = EditorState.create({ doc: content, extensions })
    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    // Inject the initial diagram context so the first render is highlighted
    const initialCtx: DiagramContext = {
      diagramType,
      rootComponent,
      ownerComp: ownerComp ?? null,
      ownerCompUuid: ownerComponentUuid,
    }
    view.dispatch({ effects: setDiagramContext.of(initialCtx) })

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sync content from outside (e.g., node change) ──────────────────────────

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.state.doc.toString() !== content) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      })
    }
  }, [content])

  // ── Sync readonly flag ──────────────────────────────────────────────────────

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: [
        readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readonly)),
        linkCursorCompartment.current.reconfigure(readonly ? integraLinkCursorTheme : []),
      ],
    })
  }, [readonly])

  // ── Sync diagram context (rootComponent / ownerComp / diagramType) ──────────

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: setDiagramContext.of({
        diagramType,
        rootComponent,
        ownerComp: ownerComp ?? null,
        ownerCompUuid: ownerComponentUuid,
      }),
    })
  }, [diagramType, rootComponent, ownerComp, ownerComponentUuid])

  // ── Auto-focus when switching to edit mode ──────────────────────────────────

  useEffect(() => {
    if (!readonly) {
      requestAnimationFrame(() => viewRef.current?.focus())
    }
  }, [readonly])

  // ── The integraCmField must be checked to suppress TypeScript's "unused import" ──
  void integraCmField

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="cm-editor-container"
    />
  )
}
