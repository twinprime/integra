import type { ComponentNode } from '../../store/types'
import { paramsToString } from '../../parser/sequenceDiagram/systemUpdater'
import { SeqLexer } from '../../parser/sequenceDiagram/lexer'
import { UcdLexer, UcdArrow } from '../../parser/useCaseDiagram/lexer'
import {
    Actor,
    Component,
    Use,
    Case,
    Identifier,
    Note,
    Over,
    Right,
    Left,
    Of,
    Comma,
} from '../../parser/tokens'
import { SeqColon, SeqArrow } from '../../parser/sequenceDiagram/lexer'
import { isInScope, getComponentAbsolutePath } from '../../utils/nodeUtils'
import { resolveEffectiveInterfaceFunctions } from '../../utils/interfaceFunctions'
import { isComponentReferenceTargetInScope } from '../../utils/diagramResolvers'

export type Suggestion = {
    label: string
    insertText: string
    replaceFrom: number
}

export type DiagramType = 'sequence-diagram' | 'use-case-diagram'

export const UC_KEYWORDS = ['actor', 'component', 'use case']
export const SEQ_KEYWORDS = [
    'actor',
    'component',
    'loop',
    'alt',
    'par',
    'opt',
    'else',
    'and',
    'end',
    'note over',
    'note right of',
    'note left of',
]

export type Context =
    | {
          type: 'keyword'
          keywords: string[]
          partial: string
          replaceFrom: number
          anchorLine: number
      }
    | {
          type: 'entity-name'
          keyword: 'actor' | 'component' | 'use case'
          partial: string
          replaceFrom: number
          anchorLine: number
      }
    | {
          type: 'function-ref'
          receiverId: string
          partial: string
          replaceFrom: number
          anchorLine: number
      }
    | {
          type: 'seq-receiver'
          partial: string
          replaceFrom: number
          anchorLine: number
      }
    | {
          type: 'uc-link-target'
          partial: string
          replaceFrom: number
          anchorLine: number
      }
    | {
          type: 'declared-entity'
          partial: string
          replaceFrom: number
          anchorLine: number
      }
    | {
          type: 'note-participant'
          partial: string
          replaceFrom: number
          anchorLine: number
      }

export function parseDeclaredIds(content: string): string[] {
    const ids: string[] = []
    const asRx = /\bas\s+(\w+)/g
    let m: RegExpExecArray | null
    while ((m = asRx.exec(content)) !== null) {
        if (!ids.includes(m[1])) ids.push(m[1])
    }
    const bareRx = /^(?:use case|actor|component)\s+([\w/-]+)(?:\s|$)/gm
    while ((m = bareRx.exec(content)) !== null) {
        const lineEnd = content.indexOf('\n', m.index)
        const line = content.slice(m.index, lineEnd < 0 ? undefined : lineEnd)
        if (/\bas\s+\w+/.test(line)) continue
        const pathParts = m[1].split('/')
        const id = pathParts[pathParts.length - 1]
        if (!ids.includes(id)) ids.push(id)
    }
    return ids
}

export function collectAllComponents(root: ComponentNode): ComponentNode[] {
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

export function findComponentByIdInTree(root: ComponentNode, id: string): ComponentNode | null {
    if (root.id === id) return root
    for (const sub of root.subComponents) {
        const found = findComponentByIdInTree(sub, id)
        if (found) return found
    }
    return null
}

// eslint-disable-next-line complexity
export function detectContext(
    content: string,
    cursorPos: number,
    diagramType: DiagramType
): Context | null {
    const lineStart = content.lastIndexOf('\n', cursorPos - 1) + 1
    const currentLine = content.slice(lineStart, cursorPos)
    const anchorLine = content.slice(0, cursorPos).split('\n').length - 1
    const indentLen = currentLine.match(/^[\t ]*/)?.[0].length ?? 0
    const lineWithoutIndent = currentLine.slice(indentLen)

    const toks =
        diagramType === 'sequence-diagram'
            ? SeqLexer.tokenize(currentLine).tokens
            : UcdLexer.tokenize(currentLine).tokens

    // ─── Arrow contexts ────────────────────────────────────────────────────────

    const arrowIdx = toks.findIndex(
        (t) => t.tokenType === (diagramType === 'sequence-diagram' ? SeqArrow : UcdArrow)
    )

    if (arrowIdx >= 0 && diagramType === 'sequence-diagram') {
        const colonIdx = toks.findIndex((t) => t.tokenType === SeqColon)
        if (colonIdx >= 0) {
            const receiverToks = toks
                .slice(arrowIdx + 1, colonIdx)
                .filter((t) => t.tokenType === Identifier)
            const receiverId = receiverToks.map((t) => t.image).join(' ')
            const textToks = toks.slice(colonIdx + 1)
            const lastTextTok = textToks[textToks.length - 1]
            const partial = lastTextTok?.image ?? ''
            const replaceFrom =
                lastTextTok != null
                    ? lineStart + lastTextTok.startOffset
                    : lineStart + currentLine.length
            return { type: 'function-ref', receiverId, partial, replaceFrom, anchorLine }
        }
        const afterArrow = toks.slice(arrowIdx + 1).filter((t) => t.tokenType === Identifier)
        const lastId = afterArrow[afterArrow.length - 1]
        const partial = lastId?.image ?? ''
        const replaceFrom =
            lastId != null ? lineStart + lastId.startOffset : lineStart + currentLine.length
        return { type: 'seq-receiver', partial, replaceFrom, anchorLine }
    }

    if (arrowIdx >= 0 && diagramType === 'use-case-diagram') {
        const afterArrow = toks.slice(arrowIdx + 1).filter((t) => t.tokenType === Identifier)
        const lastId = afterArrow[afterArrow.length - 1]
        const partial = lastId?.image ?? ''
        const replaceFrom =
            lastId != null ? lineStart + lastId.startOffset : lineStart + currentLine.length
        return { type: 'uc-link-target', partial, replaceFrom, anchorLine }
    }

    // ─── Keyword + entity-name contexts ───────────────────────────────────────

    const firstTok = toks[0]

    // ─── Note position context ─────────────────────────────────────────────────

    if (diagramType === 'sequence-diagram' && firstTok?.tokenType === Note) {
        const overIdx = toks.findIndex((t) => t.tokenType === Over)
        if (overIdx >= 0) {
            const afterOver = toks.slice(overIdx + 1)
            const commaIdx = afterOver.findIndex((t) => t.tokenType === Comma)
            const segment = commaIdx >= 0 ? afterOver.slice(commaIdx + 1) : afterOver
            const lastId = segment.filter((t) => t.tokenType === Identifier).at(-1)
            const partial = lastId?.image ?? ''
            const replaceFrom =
                lastId != null ? lineStart + lastId.startOffset : lineStart + currentLine.length
            return { type: 'note-participant', partial, replaceFrom, anchorLine }
        }

        const rightIdx = toks.findIndex((t) => t.tokenType === Right)
        const leftIdx = toks.findIndex((t) => t.tokenType === Left)
        const sideIdx = rightIdx >= 0 ? rightIdx : leftIdx
        if (sideIdx >= 0) {
            const ofIdx = toks.findIndex((t, i) => t.tokenType === Of && i > sideIdx)
            if (ofIdx >= 0) {
                const afterOf = toks.slice(ofIdx + 1).filter((t) => t.tokenType === Identifier)
                const lastId = afterOf.at(-1)
                const partial = lastId?.image ?? ''
                const replaceFrom =
                    lastId != null ? lineStart + lastId.startOffset : lineStart + currentLine.length
                return { type: 'note-participant', partial, replaceFrom, anchorLine }
            }
        }
    }

    if (diagramType === 'use-case-diagram' && firstTok?.tokenType === Use) {
        const caseIdx = toks.findIndex((t) => t.tokenType === Case)
        if (caseIdx >= 0) {
            const caseTok = toks[caseIdx]
            const afterCase = currentLine.slice(caseTok.startOffset + caseTok.image.length)
            const spaceLen = afterCase.startsWith(' ') ? 1 : 0
            const partial = afterCase.slice(spaceLen)
            const replaceFrom = lineStart + caseTok.startOffset + caseTok.image.length + spaceLen
            return { type: 'entity-name', keyword: 'use case', partial, replaceFrom, anchorLine }
        }
    }

    if (firstTok?.tokenType === Actor || firstTok?.tokenType === Component) {
        const keyword = firstTok.tokenType === Actor ? 'actor' : 'component'
        const kwEnd = firstTok.startOffset + firstTok.image.length
        const afterKw = currentLine.slice(kwEnd)
        const spaceLen = afterKw.startsWith(' ') ? 1 : 0
        const partial = afterKw.slice(spaceLen)
        const replaceFrom = lineStart + kwEnd + spaceLen
        return { type: 'entity-name', keyword, partial, replaceFrom, anchorLine }
    }

    // ─── Keyword prefix at line start ──────────────────────────────────────────

    const keywords = diagramType === 'use-case-diagram' ? UC_KEYWORDS : SEQ_KEYWORDS
    const partial = lineWithoutIndent
    const matchingKeywords = keywords.filter((k) => k.startsWith(partial) && k !== partial)
    if (partial.length > 0 && matchingKeywords.length > 0) {
        return {
            type: 'keyword',
            keywords: matchingKeywords,
            partial,
            replaceFrom: lineStart + indentLen,
            anchorLine,
        }
    }

    // ─── Declared entity ───────────────────────────────────────────────────────

    if (partial.length === 0 || /^\w+$/.test(partial)) {
        return {
            type: 'declared-entity',
            partial,
            replaceFrom: lineStart + indentLen,
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
    ctx: Extract<Context, { type: 'entity-name' }>
): Suggestion | null {
    let insertText: string
    if (isOwner) {
        insertText = actor.id
    } else {
        const ownerAbsPath = getComponentAbsolutePath(root, ownerComp.uuid)
        const compAbsPath = getComponentAbsolutePath(root, comp.uuid)
        const subtreePrefix = ownerAbsPath + '/'
        if (compAbsPath.startsWith(subtreePrefix)) {
            insertText = `${compAbsPath.slice(subtreePrefix.length)}/${actor.id}`
        } else {
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
    ctx: Extract<Context, { type: 'entity-name' }>,
    allComps: ComponentNode[],
    ownerComp: ComponentNode,
    root: ComponentNode
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
    isOwner: boolean
): { label: string; insertText: string } {
    if (isOwner) {
        return { label: `${comp.name} (self)`, insertText: comp.id }
    }
    const ownerAbsPath = getComponentAbsolutePath(root, ownerComp.uuid)
    const compAbsPath = getComponentAbsolutePath(root, comp.uuid)
    const subtreePrefix = ownerAbsPath + '/'
    if (compAbsPath.startsWith(subtreePrefix)) {
        return {
            label: `${comp.name} (local)`,
            insertText: compAbsPath.slice(subtreePrefix.length),
        }
    }
    return {
        label: `${comp.name} (from tree)`,
        insertText: `${compAbsPath} as ${comp.id}`,
    }
}

function buildComponentSuggestions(
    ctx: Extract<Context, { type: 'entity-name' }>,
    allComps: ComponentNode[],
    ownerComp: ComponentNode,
    root: ComponentNode
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
        const isSubtree = isOwner || compAbsPath.startsWith(ownerAbsPath + '/')
        if (isSubtree) localSuggs.push(entry)
        else externalSuggs.push(entry)
    }
    return [...localSuggs, ...externalSuggs]
}

function buildUseCaseSuggestions(
    ctx: Extract<Context, { type: 'entity-name' }>,
    ownerComp: ComponentNode
): Suggestion[] {
    const suggs: Suggestion[] = []
    for (const ucDiag of ownerComp.useCaseDiagrams) {
        for (const uc of ucDiag.useCases) {
            if (matchLower(uc.id, ctx.partial)) {
                suggs.push({ label: uc.name, insertText: uc.id, replaceFrom: ctx.replaceFrom })
            }
        }
    }
    return suggs
}

function buildEntityNameSuggestions(
    ctx: Extract<Context, { type: 'entity-name' }>,
    ownerComp: ComponentNode,
    rootComponent: ComponentNode,
    diagramType: DiagramType
): Suggestion[] {
    const allComps = collectAllComponents(rootComponent)
    const scopeFn =
        diagramType === 'sequence-diagram' ? isComponentReferenceTargetInScope : isInScope
    const scopedComps = allComps.filter((c) => scopeFn(rootComponent, ownerComp.uuid, c.uuid))
    if (ctx.keyword === 'actor')
        return buildActorSuggestions(ctx, scopedComps, ownerComp, rootComponent)
    if (ctx.keyword === 'component')
        return buildComponentSuggestions(ctx, scopedComps, ownerComp, rootComponent)
    if (ctx.keyword === 'use case' && diagramType === 'use-case-diagram') {
        return buildUseCaseSuggestions(ctx, ownerComp)
    }
    return []
}

function resolveReceiverComp(
    ctx: Extract<Context, { type: 'function-ref' }>,
    ownerComp: ComponentNode,
    rootComponent: ComponentNode
): ComponentNode | null {
    if (ownerComp.id === ctx.receiverId) return ownerComp
    const fromSubs = ownerComp.subComponents.find((c) => c.id === ctx.receiverId) ?? null
    return fromSubs ?? findComponentByIdInTree(rootComponent, ctx.receiverId)
}

function buildFunctionRefSuggestions(
    ctx: Extract<Context, { type: 'function-ref' }>,
    ownerComp: ComponentNode,
    rootComponent: ComponentNode
): Suggestion[] {
    const suggs: Suggestion[] = []

    // Interface/function suggestions are receiver-specific (calling a method on the receiver)
    const receiverComp = resolveReceiverComp(ctx, ownerComp, rootComponent)
    if (receiverComp) {
        for (const iface of receiverComp.interfaces) {
            for (const fn of resolveEffectiveInterfaceFunctions(
                iface,
                receiverComp,
                rootComponent
            )) {
                const insertText = `${iface.id}:${fn.id}(${paramsToString(fn.parameters)})`
                if (matchLower(insertText, ctx.partial)) {
                    suggs.push({ label: insertText, insertText, replaceFrom: ctx.replaceFrom })
                }
            }
        }
    }

    // UseCase/Sequence refs are unrestricted navigation links — scan the entire
    // component tree so suggestions appear regardless of receiver or owner scope.
    const referencedComps = collectAllComponents(rootComponent)

    for (const comp of referencedComps) {
        const isLocal = comp.uuid === ownerComp.uuid
        const absPath = isLocal ? null : getComponentAbsolutePath(rootComponent, comp.uuid)
        for (const ucDiag of comp.useCaseDiagrams) {
            for (const uc of ucDiag.useCases) {
                const ucPath = isLocal ? uc.id : absPath ? `${absPath}/${uc.id}` : uc.id
                const insertText = `UseCase:${ucPath}`
                if (matchLower(insertText, ctx.partial)) {
                    suggs.push({
                        label: `${insertText} (${uc.name})`,
                        insertText,
                        replaceFrom: ctx.replaceFrom,
                    })
                }
                for (const seq of uc.sequenceDiagrams ?? []) {
                    const seqPath = isLocal ? seq.id : absPath ? `${absPath}/${seq.id}` : seq.id
                    const seqInsertText = `Sequence:${seqPath}`
                    if (matchLower(seqInsertText, ctx.partial)) {
                        suggs.push({
                            label: `${seqInsertText} (${seq.name})`,
                            insertText: seqInsertText,
                            replaceFrom: ctx.replaceFrom,
                        })
                    }
                }
            }
        }
    }

    return suggs
}

function buildDeclaredIdSuggestions(
    ctx: Context & { partial: string; replaceFrom: number },
    content: string
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
    diagramType: DiagramType
): Suggestion[] {
    if (ctx.type === 'keyword') {
        return ctx.keywords.map((kw) => ({
            label: kw,
            insertText: kw === 'end' ? kw : kw + ' ',
            replaceFrom: ctx.replaceFrom,
        }))
    }
    if (ctx.type === 'entity-name') {
        return buildEntityNameSuggestions(ctx, ownerComp, rootComponent, diagramType)
    }
    if (ctx.type === 'function-ref') {
        return buildFunctionRefSuggestions(ctx, ownerComp, rootComponent)
    }
    if (
        ctx.type === 'seq-receiver' ||
        ctx.type === 'uc-link-target' ||
        ctx.type === 'declared-entity' ||
        ctx.type === 'note-participant'
    ) {
        return buildDeclaredIdSuggestions(ctx, content)
    }
    return []
}
