/**
 * integraLanguage.ts
 *
 * CodeMirror 6 extension providing syntax highlighting and click-navigation
 * for Integra diagram specifications (sequence and use-case diagrams).
 *
 * A `StateField<IntegraCmState>` runs line-based regex tokenisation on every
 * document or context change.  It produces:
 *   - `decorations`: DecorationSet for syntax colours
 *   - `navMap`: offset-range → UUID pairs for click-to-navigate
 */
import { StateField, StateEffect, type Extension } from "@codemirror/state"
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view"
import type { ComponentNode } from "../../../store/types"
import {
  resolveParticipant,
  resolveInOwner,
  findComponentByInterfaceId,
} from "../../../utils/diagramResolvers"

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DiagramContext {
  diagramType: "sequence-diagram" | "use-case-diagram"
  rootComponent: ComponentNode
  ownerComp: ComponentNode | null
}

/** Character range with colour class and optional navigation UUID */
export interface AnnotatedSeg {
  from: number
  to: number
  cls: string
  uuid?: string
}

// ─── StateEffect to update context from React props ───────────────────────────

export const setDiagramContext = StateEffect.define<DiagramContext>()

// ─── CSS class names (styled in integraTheme.ts) ─────────────────────────────

export const CLS = {
  keyword: "cm-integra-kw",
  name: "cm-integra-name",
  operator: "cm-integra-op",
  identifier: "cm-integra-id",
  function: "cm-integra-fn",
  label: "cm-integra-label",
  default: "cm-integra-default",
} as const

// ─── Regex patterns (same as former DiagramSpecPreview.tsx) ──────────────────

const RX_PART_NAMED =
  /^(\s*)(actor|component|use\s+case)(\s+"[^"]*")(\s+from\s+([\w/-]+))?(\s+as\s+)(\w+)(.*)/
const RX_PART_BARE = /^(\s*)(actor|component)(\s+)(\w+)(.*)/
const RX_SEQ_MSG =
  /^(\s*)(\w+)(\s*->>\s*)(\w+)(\s*:\s*)(\w+):(\w+)(\([^)]*\))(.*)/
const RX_SEQ_UC_MSG =
  /^(\s*)(\w+)(\s*->>\s*)(\w+)(\s*:\s*)(UseCase):(\w+)(:([^\n]*))?/
const RX_SEQ_MSG_ANY = /^(\s*)(\w+)(\s*->>\s*)(\w+)(\s*:\s*)(.*)/
const RX_SEQ_MSG_BARE = /^(\s*)(\w+)(\s*->>\s*)(\w+)(.*)/
const RX_UC_REL = /^(\s*)(\w+)(\s+--?>>?\s+)(\w+)(.*)/

// ─── Internal segment type ────────────────────────────────────────────────────

type Seg = { text: string; cls: string; uuid?: string }
const seg = (text: string, cls: string, uuid?: string): Seg => ({ text, cls, uuid })

// ─── Participant map: declared id → node UUID ─────────────────────────────────

function buildParticipantMap(
  lines: string[],
  root: ComponentNode,
  ownerComp: ComponentNode | null,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of lines) {
    const named = RX_PART_NAMED.exec(line)
    if (named) {
      const [, , keyword, , , fromPath, , id] = named
      const uuid = resolveParticipant(keyword, id, fromPath, root, ownerComp)
      if (uuid) map.set(id, uuid)
      continue
    }
    const bare = RX_PART_BARE.exec(line)
    if (bare) {
      const id = bare[4]
      const uuid = ownerComp ? resolveInOwner(ownerComp, id) : undefined
      if (uuid) map.set(id, uuid)
    }
  }
  return map
}

/** Find a use-case UUID by component UUID + use-case id within the tree */
function findUcUuid(root: ComponentNode, compUuid: string, ucId: string): string | undefined {
  const walk = (c: ComponentNode): string | undefined => {
    if (c.uuid === compUuid) {
      for (const d of c.useCaseDiagrams) {
        const uc = d.useCases.find((u) => u.id === ucId)
        if (uc) return uc.uuid
      }
    }
    for (const sub of c.subComponents) {
      const found = walk(sub)
      if (found) return found
    }
    return undefined
  }
  return walk(root)
}

// ─── Per-line tokenizer ───────────────────────────────────────────────────────

function tokenizeLine(
  line: string,
  diagramType: "sequence-diagram" | "use-case-diagram",
  participantMap: Map<string, string>,
  root: ComponentNode,
  ownerComp: ComponentNode | null,
): Seg[] {
  const named = RX_PART_NAMED.exec(line)
  if (named) {
    const [, indent, keyword, name, fromClause, fromPath, asKw, id, rest] = named
    const uuid = resolveParticipant(keyword, id, fromPath, root, ownerComp)
    return [
      seg(indent, ""),
      seg(keyword, CLS.keyword),
      seg(name, CLS.name),
      ...(fromClause ? [seg(fromClause, CLS.operator)] : []),
      seg(asKw, CLS.operator),
      seg(id, CLS.identifier, uuid),
      seg(rest, CLS.default),
    ]
  }

  if (diagramType === "sequence-diagram") {
    const bare = RX_PART_BARE.exec(line)
    if (bare) {
      const [, indent, keyword, space, id, rest] = bare
      const uuid = ownerComp ? resolveInOwner(ownerComp, id) : undefined
      return [
        seg(indent, ""),
        seg(keyword, CLS.keyword),
        seg(space, ""),
        seg(id, CLS.identifier, uuid),
        seg(rest, CLS.default),
      ]
    }

    const ucMsg = RX_SEQ_UC_MSG.exec(line)
    if (ucMsg) {
      const [, indent, sender, arrow, receiver, colon, , ucId, , msgLabel] = ucMsg
      const receiverCompUuid = participantMap.get(receiver)
      const ucUuid = receiverCompUuid
        ? findUcUuid(root, receiverCompUuid, ucId)
        : undefined
      return [
        seg(indent, ""),
        seg(sender, CLS.identifier, participantMap.get(sender)),
        seg(arrow, CLS.operator),
        seg(receiver, CLS.identifier, participantMap.get(receiver)),
        seg(colon, CLS.operator),
        seg(`UseCase:${ucId}`, CLS.function, ucUuid),
        ...(msgLabel
          ? [seg(":", CLS.operator), seg(msgLabel, CLS.label)]
          : []),
      ]
    }

    const msg = RX_SEQ_MSG.exec(line)
    if (msg) {
      const [, indent, sender, arrow, receiver, colon, ifaceId, fnId, params, rest] = msg
      return [
        seg(indent, ""),
        seg(sender, CLS.identifier, participantMap.get(sender)),
        seg(arrow, CLS.operator),
        seg(receiver, CLS.identifier, participantMap.get(receiver)),
        seg(colon, CLS.operator),
        seg(`${ifaceId}:${fnId}`, CLS.function, findComponentByInterfaceId(root, ifaceId)),
        seg(params, CLS.default),
        seg(rest, CLS.default),
      ]
    }

    const msgAny = RX_SEQ_MSG_ANY.exec(line)
    if (msgAny) {
      const [, indent, sender, arrow, receiver, colon, description] = msgAny
      return [
        seg(indent, ""),
        seg(sender, CLS.identifier, participantMap.get(sender)),
        seg(arrow, CLS.operator),
        seg(receiver, CLS.identifier, participantMap.get(receiver)),
        seg(colon, CLS.operator),
        seg(description, CLS.label),
      ]
    }

    const msgBare = RX_SEQ_MSG_BARE.exec(line)
    if (msgBare) {
      const [, indent, sender, arrow, receiver, rest] = msgBare
      return [
        seg(indent, ""),
        seg(sender, CLS.identifier, participantMap.get(sender)),
        seg(arrow, CLS.operator),
        seg(receiver, CLS.identifier, participantMap.get(receiver)),
        seg(rest, CLS.default),
      ]
    }
  }

  if (diagramType === "use-case-diagram") {
    const rel = RX_UC_REL.exec(line)
    if (rel) {
      const [, indent, from, arrow, to, rest] = rel
      return [
        seg(indent, ""),
        seg(from, CLS.identifier, participantMap.get(from)),
        seg(arrow, CLS.operator),
        seg(to, CLS.identifier, participantMap.get(to)),
        seg(rest, CLS.default),
      ]
    }
  }

  return [seg(line, CLS.default)]
}

// ─── Full-document annotation builder (exported for tests) ───────────────────

export function buildAnnotations(doc: string, ctx: DiagramContext): AnnotatedSeg[] {
  const lines = doc.split("\n")
  const participantMap = buildParticipantMap(lines, ctx.rootComponent, ctx.ownerComp)
  const result: AnnotatedSeg[] = []
  let offset = 0

  for (const line of lines) {
    const segs = tokenizeLine(
      line,
      ctx.diagramType,
      participantMap,
      ctx.rootComponent,
      ctx.ownerComp,
    )
    let segOffset = offset
    for (const sg of segs) {
      if (sg.text.length > 0) {
        result.push({ from: segOffset, to: segOffset + sg.text.length, cls: sg.cls, uuid: sg.uuid })
      }
      segOffset += sg.text.length
    }
    offset += line.length + 1 // +1 for '\n'
  }
  return result
}

// ─── StateField ───────────────────────────────────────────────────────────────

interface IntegraCmState {
  context: DiagramContext
  decorations: DecorationSet
  /** Subset of annotations that have a UUID (used for click navigation) */
  navMap: AnnotatedSeg[]
}

const EMPTY_ROOT: ComponentNode = {
  uuid: "",
  id: "",
  name: "",
  type: "component",
  subComponents: [],
  actors: [],
  useCaseDiagrams: [],
  interfaces: [],
}

const INITIAL_CONTEXT: DiagramContext = {
  diagramType: "sequence-diagram",
  rootComponent: EMPTY_ROOT,
  ownerComp: null,
}

function computeIntegraCmState(doc: string, ctx: DiagramContext): IntegraCmState {
  const annotations = buildAnnotations(doc, ctx)
  const decorations = Decoration.set(
    annotations
      .filter((a) => a.cls !== "")
      .map((a) => Decoration.mark({ class: a.cls }).range(a.from, a.to)),
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
