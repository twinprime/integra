/**
 * integraTheme.ts
 *
 * CodeMirror 6 dark theme for Integra diagram specification editors.
 * Colours match the former DiagramSpecPreview Tailwind classes:
 *   keyword    → purple-400  (#c084fc)
 *   name       → yellow-300  (#fde047)
 *   operator   → gray-400    (#9ca3af)
 *   identifier → blue-400    (#60a5fa)
 *   function   → green-400   (#4ade80)
 *   label      → orange-300  (#fdba74)
 *   default    → gray-300    (#d1d5db)
 */
import { EditorView } from "@codemirror/view"
import type { Extension } from "@codemirror/state"

/** Applies syntax colours for Integra-specific decoration classes */
export const integraHighlightTheme: Extension = EditorView.baseTheme({
  ".cm-integra-kw": { color: "#c084fc" },
  ".cm-integra-name": { color: "#fde047" },
  ".cm-integra-op": { color: "#9ca3af" },
  ".cm-integra-id": { color: "#60a5fa", cursor: "pointer" },
  ".cm-integra-fn": { color: "#4ade80", cursor: "pointer" },
  ".cm-integra-label": { color: "#fdba74" },
  ".cm-integra-default": { color: "#d1d5db" },
})

/** Styles the overall editor container to match the dark UI */
export const integraEditorTheme: Extension = EditorView.theme(
  {
    "&": {
      backgroundColor: "#030712", // gray-950
      color: "#d1d5db",           // gray-300
      fontSize: "0.85rem",
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      height: "100%",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      lineHeight: "1.625",       // leading-relaxed equivalent
      overflow: "auto",
      padding: "0.5rem",
    },
    ".cm-content": {
      caretColor: "#ffffff",
      padding: "0",
    },
    ".cm-line": { padding: "0" },
    ".cm-cursor": { borderLeftColor: "#ffffff" },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(59, 130, 246, 0.3)", // blue-500/30
    },
    ".cm-gutters": { display: "none" },
    ".cm-activeLine": { backgroundColor: "transparent" },
  },
  { dark: true },
)

/** All Integra theme extensions combined */
export const integraTheme: Extension = [integraHighlightTheme, integraEditorTheme]
