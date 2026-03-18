import { useEffect, useMemo, useState } from 'react'
import type { ComponentNode } from '../../store/types'
import {
    type Suggestion,
    type DiagramType,
    type Context,
    detectContext,
    buildSuggestions,
} from './autoCompleteLogic'

export type { Suggestion, DiagramType, Context }

const TRIGGER_DELAY_MS = 1000

export const useAutoComplete = (
    content: string,
    cursorPos: number,
    diagramType: DiagramType,
    ownerComp: ComponentNode | null,
    rootComponent: ComponentNode | null
): {
    suggestions: Suggestion[]
    selectedIndex: number
    setSelectedIndex: (i: number) => void
    anchorLine: number
    dismiss: () => void
    triggerNow: () => void
    reset: () => void
} => {
    const [selectedIndex, setSelectedIndex] = useState(0)
    // Track which content snapshot last triggered/dismissed — derived booleans need no setState in effects
    const [triggeredForContent, setTriggeredForContent] = useState<string | null>(null)
    const [dismissedAtContent, setDismissedAtContent] = useState<string | null>(null)

    const triggered = triggeredForContent === content
    const dismissed = dismissedAtContent === content

    // 1-second idle timeout after content changes to auto-trigger suggestions
    useEffect(() => {
        const timer = setTimeout(() => {
            setTriggeredForContent(content)
            setSelectedIndex(0)
        }, TRIGGER_DELAY_MS)
        return () => clearTimeout(timer)
    }, [content])

    const result = useMemo(() => {
        if (!triggered || dismissed || !ownerComp || !rootComponent) {
            return { suggestions: [] as Suggestion[], anchorLine: 0 }
        }
        const ctx = detectContext(content, cursorPos, diagramType)
        if (!ctx) return { suggestions: [] as Suggestion[], anchorLine: 0 }
        return {
            suggestions: buildSuggestions(ctx, content, ownerComp, rootComponent, diagramType),
            anchorLine: ctx.anchorLine,
        }
    }, [content, cursorPos, diagramType, ownerComp, rootComponent, triggered, dismissed])

    const triggerNow = () => {
        setDismissedAtContent(null)
        setTriggeredForContent(content)
        setSelectedIndex(0)
    }

    const reset = () => {
        setTriggeredForContent(null)
        setDismissedAtContent(null)
    }

    return {
        ...result,
        selectedIndex: Math.min(selectedIndex, Math.max(0, result.suggestions.length - 1)),
        setSelectedIndex,
        dismiss: () => setDismissedAtContent(content),
        triggerNow,
        reset,
    }
}
