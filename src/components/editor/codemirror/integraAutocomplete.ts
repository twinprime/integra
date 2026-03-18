/**
 * integraAutocomplete.ts
 *
 * CodeMirror 6 CompletionSource that wraps the existing context-detection and
 * suggestion-building logic from useAutoComplete.ts.
 *
 * The React component passes a `getContext()` accessor so the completion source
 * always reads the latest rootComponent / ownerComp values without requiring a
 * Compartment reconfigure on every tree change.
 */
import {
    autocompletion,
    type CompletionSource,
    type CompletionResult,
} from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import type { ComponentNode } from '../../../store/types'
import { detectContext, buildSuggestions, type DiagramType } from '../autoCompleteLogic'

export interface CompletionContext {
    diagramType: DiagramType
    ownerComp: ComponentNode | null
    rootComponent: ComponentNode
}

/**
 * Creates a CompletionSource that delegates to the shared detectContext /
 * buildSuggestions logic.  `getContext` is called on every completion request
 * so it always reflects the latest React prop values.
 */
export function createIntegralCompletionSource(
    getContext: () => CompletionContext
): CompletionSource {
    return (cmCtx): CompletionResult | null => {
        const { diagramType, ownerComp, rootComponent } = getContext()
        if (!ownerComp) return null

        const doc = cmCtx.state.doc.toString()
        const pos = cmCtx.pos

        const ctx = detectContext(doc, pos, diagramType)
        if (!ctx) return null

        const suggestions = buildSuggestions(ctx, doc, ownerComp, rootComponent, diagramType)
        if (!suggestions.length) return null

        return {
            from: ctx.replaceFrom,
            options: suggestions.map((s) => ({
                label: s.label,
                apply: s.insertText,
            })),
            // Don't filter options — buildSuggestions already filters by partial
            filter: false,
        }
    }
}

/** Returns the autocompletion extension wired to the Integra completion source */
export function integraAutocomplete(getContext: () => CompletionContext): Extension {
    return autocompletion({
        override: [createIntegralCompletionSource(getContext)],
        activateOnTyping: true,
        closeOnBlur: true,
    })
}
