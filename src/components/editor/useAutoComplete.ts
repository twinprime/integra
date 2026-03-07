import { useEffect, useMemo, useState } from "react"
import type { ComponentNode } from "../../store/types"
import { paramsToString } from "../../parser/sequenceDiagram/systemUpdater"
import { SeqLexer } from "../../parser/sequenceDiagram/lexer"
import { UcdLexer } from "../../parser/useCaseDiagram/lexer"
import { Actor, Component, Use, Case, Arrow, Identifier } from "../../parser/tokens"
import { SeqColon } from "../../parser/sequenceDiagram/lexer"
import { isInScope, getComponentAbsolutePath } from "../../utils/nodeUtils"

export type Suggestion = {
  label: string
  insertText: string
  replaceFrom: number
}

export type DiagramType = "sequence-diagram" | "use-case-diagram"

const UC_KEYWORDS = ["actor", "component", "use case"]
const SEQ_KEYWORDS = ["actor", "component", "loop", "alt", "par", "opt", "else", "and", "end"]

function parseDeclaredIds(content: string): string[] {
  const ids: string[] = []
  // Explicit aliases: "as id"
  const asRx = /\bas\s+(\w+)/g
  let m: RegExpExecArray | null
  while ((m = asRx.exec(content)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1])
  }
  // Bare declarations: "actor id" or "component id" (no "as" alias)
  const bareRx = /^(?:actor|component)\s+([\w/-]+)(?:\s|$)/gm
  while ((m = bareRx.exec(content)) !== null) {
    // Skip if this declaration has an "as" alias (already captured above)
    const lineEnd = content.indexOf("\n", m.index)
    const line = content.slice(m.index, lineEnd < 0 ? undefined : lineEnd)
    if (/\bas\s+\w+/.test(line)) continue
    const pathParts = m[1].split("/")
    const id = pathParts[pathParts.length - 1]
    if (!ids.includes(id)) ids.push(id)
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

export type Context =
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

export function detectContext(
  content: string,
  cursorPos: number,
  diagramType: DiagramType,
): Context | null {
  const lineStart = content.lastIndexOf("\n", cursorPos - 1) + 1
  const currentLine = content.slice(lineStart, cursorPos)
  const anchorLine = content.slice(0, cursorPos).split("\n").length - 1

  // Tokenize the current line (up to cursor) using the grammar's own lexer
  const toks = diagramType === "sequence-diagram"
    ? SeqLexer.tokenize(currentLine).tokens
    : UcdLexer.tokenize(currentLine).tokens

  // ─── Arrow contexts ────────────────────────────────────────────────────────

  const arrowIdx = toks.findIndex((t) => t.tokenType === Arrow)

  if (arrowIdx >= 0 && diagramType === "sequence-diagram") {
    const colonIdx = toks.findIndex((t) => t.tokenType === SeqColon)
    if (colonIdx >= 0) {
      // After colon → function-ref context
      const receiverToks = toks.slice(arrowIdx + 1, colonIdx)
        .filter((t) => t.tokenType === Identifier)
      const receiverId = receiverToks.map((t) => t.image).join(" ")
      const textToks = toks.slice(colonIdx + 1)
      const lastTextTok = textToks[textToks.length - 1]
      const partial = lastTextTok?.image ?? ""
      const replaceFrom = lastTextTok != null
        ? lineStart + lastTextTok.startOffset
        : lineStart + currentLine.length
      return { type: "function-ref", receiverId, partial, replaceFrom, anchorLine }
    }
    // No colon yet → seq-receiver
    const afterArrow = toks.slice(arrowIdx + 1).filter((t) => t.tokenType === Identifier)
    const lastId = afterArrow[afterArrow.length - 1]
    const partial = lastId?.image ?? ""
    const replaceFrom = lastId != null
      ? lineStart + lastId.startOffset
      : lineStart + currentLine.length
    return { type: "seq-receiver", partial, replaceFrom, anchorLine }
  }

  if (arrowIdx >= 0 && diagramType === "use-case-diagram") {
    const afterArrow = toks.slice(arrowIdx + 1).filter((t) => t.tokenType === Identifier)
    const lastId = afterArrow[afterArrow.length - 1]
    const partial = lastId?.image ?? ""
    const replaceFrom = lastId != null
      ? lineStart + lastId.startOffset
      : lineStart + currentLine.length
    return { type: "uc-link-target", partial, replaceFrom, anchorLine }
  }

  // ─── Keyword + entity-name contexts ───────────────────────────────────────

  const firstTok = toks[0]

  // "use case" keyword (UCD only)
  if (diagramType === "use-case-diagram" && firstTok?.tokenType === Use) {
    const caseIdx = toks.findIndex((t) => t.tokenType === Case)
    if (caseIdx >= 0) {
      const caseTok = toks[caseIdx]
      const afterCase = currentLine.slice(caseTok.startOffset + caseTok.image.length)
      const spaceLen = afterCase.startsWith(" ") ? 1 : 0
      const partial = afterCase.slice(spaceLen)
      const replaceFrom = lineStart + caseTok.startOffset + caseTok.image.length + spaceLen
      return { type: "entity-name", keyword: "use case", partial, replaceFrom, anchorLine }
    }
    // "use" without "case" yet → fall through to keyword prefix check
  }

  // "actor" / "component" keyword
  if (firstTok?.tokenType === Actor || firstTok?.tokenType === Component) {
    const keyword = firstTok.tokenType === Actor ? "actor" : "component"
    const kwEnd = firstTok.startOffset + firstTok.image.length
    const afterKw = currentLine.slice(kwEnd)
    const spaceLen = afterKw.startsWith(" ") ? 1 : 0
    const partial = afterKw.slice(spaceLen)
    const replaceFrom = lineStart + kwEnd + spaceLen
    return { type: "entity-name", keyword, partial, replaceFrom, anchorLine }
  }

  // ─── Keyword prefix at line start ──────────────────────────────────────────

  const keywords = diagramType === "use-case-diagram" ? UC_KEYWORDS : SEQ_KEYWORDS
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

  // ─── Declared entity ───────────────────────────────────────────────────────

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

function matchLower(text: string, partial: string): boolean {
  return !partial || text.toLowerCase().includes(partial.toLowerCase())
}

function resolveActorEntry(
  root: ComponentNode,
  ownerComp: ComponentNode,
  comp: ComponentNode,
  actor: { name: string; id: string },
  isOwner: boolean,
  ctx: Extract<Context, { type: "entity-name" }>,
): Suggestion | null {
  let insertText: string
  if (isOwner) {
    insertText = actor.id
  } else {
    const ownerAbsPath = getComponentAbsolutePath(root, ownerComp.uuid)
    const compAbsPath = getComponentAbsolutePath(root, comp.uuid)
    const subtreePrefix = ownerAbsPath + "/"
    if (compAbsPath.startsWith(subtreePrefix)) {
      // Relative path from ownerComp (e.g. "childId/actorId")
      insertText = `${compAbsPath.slice(subtreePrefix.length)}/${actor.id}`
    } else {
      // Absolute path + alias for cross-tree references
      insertText = `${compAbsPath}/${actor.id} as ${actor.id}`
    }
  }
  if (!matchLower(insertText, ctx.partial)) return null
  return {
    label: isOwner ? `${actor.name} (local)` : `${actor.name} (from ${comp.name})`,
    insertText,
    replaceFrom: ctx.replaceFrom,
  }
}

function buildActorSuggestions(
  ctx: Extract<Context, { type: "entity-name" }>,
  allComps: ComponentNode[],
  ownerComp: ComponentNode,
  root: ComponentNode,
): Suggestion[] {
  const localSuggs: Suggestion[] = []
  const externalSuggs: Suggestion[] = []
  for (const comp of allComps) {
    const isOwner = comp.uuid === ownerComp.uuid
    for (const actor of comp.actors) {
      const entry = resolveActorEntry(root, ownerComp, comp, actor, isOwner, ctx)
      if (!entry) continue
      if (isOwner) localSuggs.push(entry)
      else externalSuggs.push(entry)
    }
  }
  return [...localSuggs, ...externalSuggs]
}

function componentSuggestionText(
  root: ComponentNode,
  ownerComp: ComponentNode,
  comp: ComponentNode,
  isOwner: boolean,
): { label: string; insertText: string } {
  if (isOwner) {
    return { label: `${comp.name} (self)`, insertText: comp.id }
  }
  const ownerAbsPath = getComponentAbsolutePath(root, ownerComp.uuid)
  const compAbsPath = getComponentAbsolutePath(root, comp.uuid)
  const subtreePrefix = ownerAbsPath + "/"
  if (compAbsPath.startsWith(subtreePrefix)) {
    // Relative path from ownerComp (e.g. "childId" or "childId/grandchildId")
    return { label: `${comp.name} (local)`, insertText: compAbsPath.slice(subtreePrefix.length) }
  }
  return {
    label: `${comp.name} (from tree)`,
    insertText: `${compAbsPath} as ${comp.id}`,
  }
}

function buildComponentSuggestions(
  ctx: Extract<Context, { type: "entity-name" }>,
  allComps: ComponentNode[],
  ownerComp: ComponentNode,
  root: ComponentNode,
): Suggestion[] {
  const localSuggs: Suggestion[] = []
  const externalSuggs: Suggestion[] = []
  for (const comp of allComps) {
    const isOwner = comp.uuid === ownerComp.uuid
    const { label, insertText } = componentSuggestionText(root, ownerComp, comp, isOwner)
    if (!matchLower(insertText, ctx.partial)) continue
    const entry = { label, insertText, replaceFrom: ctx.replaceFrom }
    const ownerAbsPath = getComponentAbsolutePath(root, ownerComp.uuid)
    const compAbsPath = getComponentAbsolutePath(root, comp.uuid)
    const isSubtree = isOwner || compAbsPath.startsWith(ownerAbsPath + "/")
    if (isSubtree) localSuggs.push(entry)
    else externalSuggs.push(entry)
  }
  return [...localSuggs, ...externalSuggs]
}

function buildUseCaseSuggestions(
  ctx: Extract<Context, { type: "entity-name" }>,
  ownerComp: ComponentNode,
): Suggestion[] {
  const suggs: Suggestion[] = []
  for (const ucDiag of ownerComp.useCaseDiagrams) {
    for (const uc of ucDiag.useCases) {
      const insertText = `"${uc.name}" as ${uc.id}`
      if (matchLower(insertText, ctx.partial)) {
        suggs.push({ label: uc.name, insertText, replaceFrom: ctx.replaceFrom })
      }
    }
  }
  return suggs
}

function buildEntityNameSuggestions(
  ctx: Extract<Context, { type: "entity-name" }>,
  ownerComp: ComponentNode,
  rootComponent: ComponentNode,
  diagramType: DiagramType,
): Suggestion[] {
  const allComps = collectAllComponents(rootComponent)
  const scopedComps = allComps.filter((c) => isInScope(rootComponent, ownerComp.uuid, c.uuid))
  if (ctx.keyword === "actor") return buildActorSuggestions(ctx, scopedComps, ownerComp, rootComponent)
  if (ctx.keyword === "component") return buildComponentSuggestions(ctx, scopedComps, ownerComp, rootComponent)
  if (ctx.keyword === "use case" && diagramType === "use-case-diagram") {
    return buildUseCaseSuggestions(ctx, ownerComp)
  }
  return []
}

function resolveReceiverComp(
  ctx: Extract<Context, { type: "function-ref" }>,
  ownerComp: ComponentNode,
  rootComponent: ComponentNode,
): ComponentNode | null {
  if (ownerComp.id === ctx.receiverId) return ownerComp
  const fromSubs = ownerComp.subComponents.find((c) => c.id === ctx.receiverId) ?? null
  return fromSubs ?? findComponentByIdInTree(rootComponent, ctx.receiverId)
}

function buildFunctionRefSuggestions(
  ctx: Extract<Context, { type: "function-ref" }>,
  ownerComp: ComponentNode,
  rootComponent: ComponentNode,
): Suggestion[] {
  const receiverComp = resolveReceiverComp(ctx, ownerComp, rootComponent)
  if (!receiverComp) return []

  const suggs: Suggestion[] = []
  for (const iface of receiverComp.interfaces) {
    for (const fn of iface.functions) {
      const insertText = `${iface.id}:${fn.id}(${paramsToString(fn.parameters)})`
      if (matchLower(insertText, ctx.partial)) {
        suggs.push({ label: insertText, insertText, replaceFrom: ctx.replaceFrom })
      }
    }
  }
  for (const ucDiag of receiverComp.useCaseDiagrams) {
    for (const uc of ucDiag.useCases) {
      // Build path: omit prefix if receiverComp === ownerComp (local reference)
      const isLocal = receiverComp.uuid === ownerComp.uuid
      let ucPath: string
      if (isLocal) {
        ucPath = uc.id
      } else {
        const absPath = getComponentAbsolutePath(rootComponent, receiverComp.uuid)
        ucPath = absPath ? `${absPath}/${uc.id}` : uc.id
      }
      const insertText = `UseCase:${ucPath}`
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

function buildDeclaredIdSuggestions(
  ctx: Context & { partial: string; replaceFrom: number },
  content: string,
): Suggestion[] {
  return parseDeclaredIds(content)
    .filter((id) => !ctx.partial || id.toLowerCase().startsWith(ctx.partial.toLowerCase()))
    .map((id) => ({ label: id, insertText: id, replaceFrom: ctx.replaceFrom }))
}

export function buildSuggestions(
  ctx: Context,
  content: string,
  ownerComp: ComponentNode,
  rootComponent: ComponentNode,
  diagramType: DiagramType,
): Suggestion[] {
  if (ctx.type === "keyword") {
    return ctx.keywords.map((kw) => ({
      label: kw,
      // "end" needs no trailing space; all other keywords expect text after them
      insertText: kw === "end" ? kw : kw + " ",
      replaceFrom: ctx.replaceFrom,
    }))
  }
  if (ctx.type === "entity-name") {
    return buildEntityNameSuggestions(ctx, ownerComp, rootComponent, diagramType)
  }
  if (ctx.type === "function-ref") {
    return buildFunctionRefSuggestions(ctx, ownerComp, rootComponent)
  }
  if (
    ctx.type === "seq-receiver" ||
    ctx.type === "uc-link-target" ||
    ctx.type === "declared-entity"
  ) {
    return buildDeclaredIdSuggestions(ctx, content)
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
  reset: () => void
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

  const reset = () => {
    setTriggeredForContent(null)
    setDismissedAtContent(null)
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
    reset,
  }
}
