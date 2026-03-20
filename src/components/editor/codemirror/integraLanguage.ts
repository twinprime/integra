/**
 * integraLanguage.ts
 *
 * CodeMirror 6 extension providing syntax highlighting and click-navigation
 * for Integra diagram specifications (sequence and use-case diagrams).
 *
 * A `StateField<IntegraCmState>` runs on every document or context change.
 * It produces:
 *   - `decorations`: DecorationSet for syntax colours (from Chevrotain lexer)
 *   - `navMap`: offset-range → UUID pairs for click-to-navigate (from CST positioned visitors)
 */
import { StateField, StateEffect, type Extension } from '@codemirror/state'
import { EditorView, Decoration, type DecorationSet } from '@codemirror/view'
import type { ComponentNode } from '../../../store/types'
import { SeqLexer } from '../../../parser/sequenceDiagram/lexer'
import { UcdLexer } from '../../../parser/useCaseDiagram/lexer'
import { buildSeqNavEntries } from '../../../parser/sequenceDiagram/positionedVisitor'
import { buildUcdNavEntries } from '../../../parser/useCaseDiagram/positionedVisitor'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DiagramContext {
    diagramType: 'sequence-diagram' | 'use-case-diagram'
    rootComponent: ComponentNode
    ownerComp: ComponentNode | null
    ownerCompUuid?: string
}

/** Character range with colour class and optional navigation UUID */
export interface AnnotatedSeg {
    from: number
    to: number
    cls: string
    uuid?: string
    ifaceUuid?: string
}

// ─── StateEffect to update context from React props ───────────────────────────

export const setDiagramContext = StateEffect.define<DiagramContext>()

// ─── CSS class names (styled in integraTheme.ts) ─────────────────────────────

export const CLS = {
    keyword: 'cm-integra-kw',
    name: 'cm-integra-name',
    operator: 'cm-integra-op',
    identifier: 'cm-integra-id',
    function: 'cm-integra-fn',
    label: 'cm-integra-label',
    default: 'cm-integra-default',
} as const

// ─── Token-type name → CSS class ─────────────────────────────────────────────
// Driven by the Chevrotain token types; no regex patterns needed.

const TOKEN_CLASS: Record<string, string> = {
    Actor: CLS.keyword,
    Component: CLS.keyword,
    Use: CLS.keyword,
    Case: CLS.keyword,
    As: CLS.keyword,
    Note: CLS.keyword,
    Right: CLS.keyword,
    Left: CLS.keyword,
    Of: CLS.keyword,
    Over: CLS.keyword,
    Loop: CLS.keyword,
    Alt: CLS.keyword,
    Par: CLS.keyword,
    Opt: CLS.keyword,
    Else: CLS.keyword,
    And: CLS.keyword,
    End: CLS.keyword,
    Identifier: CLS.identifier,
    Arrow: CLS.operator,
    UcdArrow: CLS.operator,
    UcdColon: CLS.operator,
    UcdLabelText: CLS.label,
    SeqArrow: CLS.operator,
    Colon: CLS.operator,
    SeqColon: CLS.operator,
    Comma: CLS.operator,
    Slash: CLS.operator,
    FunctionRef: CLS.function,
    UseCaseRef: CLS.function,
    UseCaseDiagramRef: CLS.function,
    SequenceRef: CLS.function,
    LabelText: CLS.label,
    BlockConditionText: CLS.label,
}

// ─── Full-document annotation builder (exported for tests) ───────────────────

export function buildAnnotations(doc: string, ctx: DiagramContext): AnnotatedSeg[] {
    if (!doc) return []

    // Step 1: lex the document → CSS class per token
    const lexResult =
        ctx.diagramType === 'sequence-diagram' ? SeqLexer.tokenize(doc) : UcdLexer.tokenize(doc)

    const anns: AnnotatedSeg[] = lexResult.tokens.flatMap((tok) => {
        const cls = TOKEN_CLASS[tok.tokenType.name]
        if (!cls) return []
        return [{ from: tok.startOffset, to: tok.startOffset + tok.image.length, cls }]
    })

    // Step 2: overlay UUIDs from the positioned CST visitor
    if (ctx.ownerComp) {
        const navEntries =
            ctx.diagramType === 'sequence-diagram'
                ? buildSeqNavEntries(doc, ctx.rootComponent, ctx.ownerComp, ctx.ownerCompUuid)
                : buildUcdNavEntries(doc, ctx.rootComponent, ctx.ownerComp)

        const byFrom = new Map(anns.map((a, i) => [a.from, i]))
        for (const nav of navEntries) {
            const idx = byFrom.get(nav.from)
            if (idx !== undefined) {
                anns[idx] = {
                    ...anns[idx],
                    uuid: nav.uuid,
                    ifaceUuid:
                        'ifaceUuid' in nav ? (nav as { ifaceUuid?: string }).ifaceUuid : undefined,
                }
            }
        }
    }

    return anns
}

// ─── StateField ───────────────────────────────────────────────────────────────

interface IntegraCmState {
    context: DiagramContext
    decorations: DecorationSet
    /** Subset of annotations that have a UUID (used for click navigation) */
    navMap: AnnotatedSeg[]
}

const EMPTY_ROOT: ComponentNode = {
    uuid: '',
    id: '',
    name: '',
    type: 'component',
    subComponents: [],
    actors: [],
    useCaseDiagrams: [],
    interfaces: [],
}

const INITIAL_CONTEXT: DiagramContext = {
    diagramType: 'sequence-diagram',
    rootComponent: EMPTY_ROOT,
    ownerComp: null,
}

function computeIntegraCmState(doc: string, ctx: DiagramContext): IntegraCmState {
    const annotations = buildAnnotations(doc, ctx)
    const decorations = Decoration.set(
        annotations
            .filter((a) => a.cls !== '')
            .map((a) => Decoration.mark({ class: a.cls }).range(a.from, a.to))
    )
    return { context: ctx, decorations, navMap: annotations.filter((a) => !!a.uuid) }
}

export const integraCmField = StateField.define<IntegraCmState>({
    create(state) {
        return computeIntegraCmState(state.doc.toString(), INITIAL_CONTEXT)
    },
    update(value, tr) {
        let ctx = value.context
        for (const e of tr.effects) {
            if (e.is(setDiagramContext)) ctx = e.value
        }
        const ctxChanged = ctx !== value.context
        if (!tr.docChanged && !ctxChanged) return value
        return computeIntegraCmState(tr.newDoc.toString(), ctx)
    },
    provide: (f) => EditorView.decorations.from(f, (s) => s.decorations),
})

/** Read the navigation map from an EditorView */
export function navMapFromView(view: EditorView): AnnotatedSeg[] {
    return view.state.field(integraCmField).navMap
}

/** Extension bundle: include this in your EditorState.create({ extensions }) */
export const integraLanguage: Extension = [integraCmField]
