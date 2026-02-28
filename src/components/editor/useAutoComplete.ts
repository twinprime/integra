import { useEffect, useMemo, useState } from "react"
import type { ComponentNode } from "../../store/types"
import { paramsToString } from "../../utils/sequenceDiagramParser"

export type Suggestion = {
  label: string
  insertText: string
  replaceFrom: number
}

type DiagramType = "sequence-diagram" | "use-case-diagram"

const UC_KEYWORDS = ["actor", "component", "use case"]
const SEQ_KEYWORDS = ["actor", "component"]

function parseDeclaredIds(content: string): string[] {
  const ids: string[] = []
  const rx = /\bas\s+(\w+)/g
  let m: RegExpExecArray | null
  while ((m = rx.exec(content)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1])
  }
  return ids
}

function collectAllComponents(root: ComponentNode): ComponentNode[] {
  const result: ComponentNode[] = [root]
  function walk(c: ComponentNode): void {
    for (const sub of c.subComponents) {
      result.push(sub)
      walk(sub)
    }
  }
  walk(root)
  return result
}

function findComponentByIdInTree(
  root: ComponentNode,
  id: string,
): ComponentNode | null {
  if (root.id === id) return root
  for (const sub of root.subComponents) {
    const found = findComponentByIdInTree(sub, id)
    if (found) return found
  }
  return null
}

type Context =
  | {
      type: "keyword"
      keywords: string[]
      partial: string
      replaceFrom: number
      anchorLine: number
    }
  | {
      type: "entity-name"
      keyword: "actor" | "component" | "use case"
      partial: string
      replaceFrom: number
      anchorLine: number
    }
  | {
      type: "function-ref"
      receiverId: string
      partial: string
      replaceFrom: number
      anchorLine: number
    }
  | {
      type: "seq-receiver"
      partial: string
      replaceFrom: number
      anchorLine: number
    }
  | {
      type: "uc-link-target"
      partial: string
      replaceFrom: number
      anchorLine: number
    }
  | {
      type: "declared-entity"
      partial: string
      replaceFrom: number
      anchorLine: number
    }

function detectContext(
  content: string,
  cursorPos: number,
  diagramType: DiagramType,
): Context | null {
  const lineStart = content.lastIndexOf("\n", cursorPos - 1) + 1
  const currentLine = content.slice(lineStart, cursorPos)
  const anchorLine = content.slice(0, cursorPos).split("\n").length - 1

  // Function reference: sender->>receiver: partial (sequence diagrams only)
  if (diagramType === "sequence-diagram") {
    const msgMatch = /^(\w+)\s*->>\s*(\w+):\s*(\S*)$/.exec(currentLine)
    if (msgMatch) {
      const partial = msgMatch[3]
      return {
        type: "function-ref",
        receiverId: msgMatch[2],
        partial,
        replaceFrom: cursorPos - partial.length,
        anchorLine,
      }
    }

    // Receiver suggestion: sender->> with partial receiver (no colon yet)
    const receiverMatch = /^(\w+)\s*->>\s*(\w*)$/.exec(currentLine)
    if (receiverMatch) {
      const partial = receiverMatch[2]
      return {
        type: "seq-receiver",
        partial,
        replaceFrom: cursorPos - partial.length,
        anchorLine,
      }
    }
  }

  // Use-case link target: entityId --> partial  or  entityId -->> partial
  if (diagramType === "use-case-diagram") {
    const linkMatch = /^(\w+)\s*--?>>?\s*([\w]*)$/.exec(currentLine)
    if (linkMatch) {
      const partial = linkMatch[2]
      return {
        type: "uc-link-target",
        partial,
        replaceFrom: cursorPos - partial.length,
        anchorLine,
      }
    }
  }

  // Entity name after keyword (keyword must be followed by exactly one space)
  const keywords =
    diagramType === "use-case-diagram" ? UC_KEYWORDS : SEQ_KEYWORDS
  for (const kw of keywords) {
    if (currentLine.startsWith(kw + " ")) {
      const partial = currentLine.slice(kw.length + 1)
      return {
        type: "entity-name",
        keyword: kw as "actor" | "component" | "use case",
        partial,
        replaceFrom: lineStart + kw.length + 1,
        anchorLine,
      }
    }
  }

  // Keyword prefix at line start
  const partial = currentLine
  const matchingKeywords = keywords.filter(
    (k) => k.startsWith(partial) && k !== partial,
  )
  if (partial.length > 0 && matchingKeywords.length > 0) {
    return {
      type: "keyword",
      keywords: matchingKeywords,
      partial,
      replaceFrom: lineStart,
      anchorLine,
    }
  }

  // Declared entity IDs (empty line or word-only partial)
  if (partial.length === 0 || /^\w+$/.test(partial)) {
    return {
      type: "declared-entity",
      partial,
      replaceFrom: lineStart,
      anchorLine,
    }
  }

  return null
}

function buildSuggestions(
  ctx: Context,
  content: string,
  ownerComp: ComponentNode,
  rootComponent: ComponentNode,
  diagramType: DiagramType,
): Suggestion[] {
  const matchLower = (text: string, partial: string) =>
    !partial || text.toLowerCase().includes(partial.toLowerCase())

  if (ctx.type === "keyword") {
    return ctx.keywords.map((kw) => ({
      label: kw,
      insertText: kw + " ",
      replaceFrom: ctx.replaceFrom,
    }))
  }

  if (ctx.type === "entity-name") {
    const suggs: Suggestion[] = []
    const allComps = collectAllComponents(rootComponent)

    if (ctx.keyword === "actor") {
      const localSuggs: Suggestion[] = []
      const externalSuggs: Suggestion[] = []
      for (const comp of allComps) {
        const isOwner = comp.uuid === ownerComp.uuid
        for (const actor of comp.actors) {
          const insertText = isOwner
            ? `"${actor.name}" as ${actor.id}`
            : `"${actor.name}" from ${comp.id}/${actor.id} as ${actor.id}`
          if (matchLower(insertText, ctx.partial)) {
            const entry = {
              label: isOwner
                ? `${actor.name} (local)`
                : `${actor.name} (from ${comp.name})`,
              insertText,
              replaceFrom: ctx.replaceFrom,
            }
            if (isOwner) localSuggs.push(entry)
            else externalSuggs.push(entry)
          }
        }
      }
      return [...localSuggs, ...externalSuggs]
    } else if (ctx.keyword === "component") {
      const localSuggs: Suggestion[] = []
      const externalSuggs: Suggestion[] = []
      for (const comp of allComps) {
        const isOwner = comp.uuid === ownerComp.uuid
        const isDirectChild = ownerComp.subComponents.some(
          (s) => s.uuid === comp.uuid,
        )
        let insertText: string
        let label: string
        if (isOwner) {
          insertText = `"${comp.name}" as ${comp.id}`
          label = `${comp.name} (self)`
        } else if (isDirectChild) {
          insertText = `"${comp.name}" as ${comp.id}`
          label = `${comp.name} (local)`
        } else {
          insertText = `"${comp.name}" from ${comp.id} as ${comp.id}`
          label = `${comp.name} (from tree)`
        }
        if (matchLower(insertText, ctx.partial)) {
          const entry = { label, insertText, replaceFrom: ctx.replaceFrom }
          if (isOwner || isDirectChild) localSuggs.push(entry)
          else externalSuggs.push(entry)
        }
      }
      return [...localSuggs, ...externalSuggs]
    } else if (
      ctx.keyword === "use case" &&
      diagramType === "use-case-diagram"
    ) {
      for (const ucDiag of ownerComp.useCaseDiagrams) {
        for (const uc of ucDiag.useCases) {
          const insertText = `"${uc.name}" as ${uc.id}`
          if (matchLower(insertText, ctx.partial)) {
            suggs.push({
              label: uc.name,
              insertText,
              replaceFrom: ctx.replaceFrom,
            })
          }
        }
      }
    }

    return suggs
  }

  if (ctx.type === "function-ref") {
    let receiverComp: ComponentNode | null = null
    if (ownerComp.id === ctx.receiverId) {
      receiverComp = ownerComp
    } else {
      receiverComp =
        ownerComp.subComponents.find((c) => c.id === ctx.receiverId) ?? null
      if (!receiverComp)
        receiverComp = findComponentByIdInTree(rootComponent, ctx.receiverId)
    }
    if (!receiverComp) return []

    const suggs: Suggestion[] = []
    for (const iface of receiverComp.interfaces) {
      for (const fn of iface.functions) {
        const insertText = `${iface.id}:${fn.id}(${paramsToString(fn.parameters)})`
        if (matchLower(insertText, ctx.partial)) {
          suggs.push({
            label: insertText,
            insertText,
            replaceFrom: ctx.replaceFrom,
          })
        }
      }
    }
    for (const ucDiag of receiverComp.useCaseDiagrams) {
      for (const uc of ucDiag.useCases) {
        const insertText = `UseCase:${uc.id}`
        if (matchLower(insertText, ctx.partial)) {
          suggs.push({
            label: `${insertText} (${uc.name})`,
            insertText,
            replaceFrom: ctx.replaceFrom,
          })
        }
      }
    }
    return suggs
  }

  if (ctx.type === "seq-receiver" || ctx.type === "uc-link-target") {
    return parseDeclaredIds(content)
      .filter(
        (id) =>
          !ctx.partial ||
          id.toLowerCase().startsWith(ctx.partial.toLowerCase()),
      )
      .map((id) => ({
        label: id,
        insertText: id,
        replaceFrom: ctx.replaceFrom,
      }))
  }

  if (ctx.type === "declared-entity") {
    return parseDeclaredIds(content)
      .filter(
        (id) =>
          !ctx.partial ||
          id.toLowerCase().startsWith(ctx.partial.toLowerCase()),
      )
      .map((id) => ({
        label: id,
        insertText: id,
        replaceFrom: ctx.replaceFrom,
      }))
  }

  return []
}

const TRIGGER_DELAY_MS = 1000

export const useAutoComplete = (
  content: string,
  cursorPos: number,
  diagramType: DiagramType,
  ownerComp: ComponentNode | null,
  rootComponent: ComponentNode | null,
): {
  suggestions: Suggestion[]
  selectedIndex: number
  setSelectedIndex: (i: number) => void
  anchorLine: number
  dismiss: () => void
  triggerNow: () => void
} => {
  const [selectedIndex, setSelectedIndex] = useState(0)
  // Track which content snapshot last triggered/dismissed — derived booleans need no setState in effects
  const [triggeredForContent, setTriggeredForContent] = useState<string | null>(
    null,
  )
  const [dismissedAtContent, setDismissedAtContent] = useState<string | null>(
    null,
  )

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
      suggestions: buildSuggestions(
        ctx,
        content,
        ownerComp,
        rootComponent,
        diagramType,
      ),
      anchorLine: ctx.anchorLine,
    }
  }, [
    content,
    cursorPos,
    diagramType,
    ownerComp,
    rootComponent,
    triggered,
    dismissed,
  ])

  const triggerNow = () => {
    setDismissedAtContent(null)
    setTriggeredForContent(content)
    setSelectedIndex(0)
  }

  return {
    ...result,
    selectedIndex: Math.min(
      selectedIndex,
      Math.max(0, result.suggestions.length - 1),
    ),
    setSelectedIndex,
    dismiss: () => setDismissedAtContent(content),
    triggerNow,
  }
}
