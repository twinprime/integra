/**
 * visitor.ts — Chevrotain CST visitor that produces a SeqAst from the parse tree.
 */
import { seqParser } from "./parser"

const BaseVisitor = seqParser.getBaseCstVisitorConstructorWithDefaults()

// ─── AST types ────────────────────────────────────────────────────────────────

export type EntityType = "actor" | "component"

export interface SeqDeclaration {
  entityType: EntityType
  /** Path segments as written, e.g. ["root", "services", "auth"] or ["sim_leader"] */
  path: string[]
  /** Explicit alias from `as <id>`, or null if omitted */
  alias: string | null
  /** Resolved id: alias if present, else last path segment */
  id: string
}

export interface SeqMessage {
  from: string
  to: string
  /** Populated when the label matches FUNCTION_REF */
  functionRef: { interfaceId: string; functionId: string; rawParams: string } | null
  /** Raw label text (undefined if no label) */
  label: string | null
}

export interface SeqNote {
  position:
    | { kind: "side"; side: "right" | "left"; participant: string }
    | { kind: "over"; participants: [string, string | null] }
  text: string
}

export interface SeqAst {
  declarations: SeqDeclaration[]
  messages: SeqMessage[]
  notes: SeqNote[]
}

// ─── Visitor ──────────────────────────────────────────────────────────────────

class SequenceDiagramVisitor extends BaseVisitor {
  constructor() {
    super()
    this.validateVisitor()
  }

  sequenceDiagram(ctx: Record<string, unknown[]>): SeqAst {
    const declarations: SeqDeclaration[] = []
    const messages: SeqMessage[] = []
    const notes: SeqNote[] = []

    for (const stmt of ctx.seqStatement ?? []) {
      const result = this.visit(stmt as never) as SeqDeclaration | SeqMessage | SeqNote | undefined
      if (!result) continue
      if ("entityType" in result) declarations.push(result as SeqDeclaration)
      else if ("position" in result) notes.push(result as SeqNote)
      else messages.push(result as SeqMessage)
    }
    return { declarations, messages, notes }
  }

  seqStatement(ctx: Record<string, unknown[]>): SeqDeclaration | SeqMessage | SeqNote {
    if (ctx.seqDeclaration) return this.visit(ctx.seqDeclaration as never) as SeqDeclaration
    if (ctx.seqNote) return this.visit(ctx.seqNote as never) as SeqNote
    return this.visit(ctx.seqMessage as never) as SeqMessage
  }

  seqDeclaration(ctx: Record<string, { image: string }[]>): SeqDeclaration {
    const entityType: EntityType = ctx.Actor ? "actor" : "component"
    const path = this.visit(ctx.nodePath as never) as string[]
    const alias = ctx.Identifier?.[0]?.image ?? null
    return {
      entityType,
      path,
      alias,
      id: alias ?? path[path.length - 1],
    }
  }

  nodePath(ctx: Record<string, { image: string }[]>): string[] {
    return (ctx.Identifier ?? []).map((t) => t.image)
  }

  seqNote(ctx: Record<string, { image: string }[]>): SeqNote {
    const position = this.visit(ctx.seqNotePosition as never) as SeqNote["position"]
    // NoteText is aliased to LabelText in the new lexer
    const rawText = ctx.LabelText?.[0]?.image ?? ""
    return { position, text: rawText.replace(/\\n/g, "\n") }
  }

  seqNotePosition(ctx: Record<string, { image: string }[]>): SeqNote["position"] {
    if (ctx.Over) {
      const ids = (ctx.Identifier ?? []).map((t) => t.image)
      return { kind: "over", participants: [ids[0], ids[1] ?? null] }
    }
    const side = ctx.Right ? "right" : "left"
    return { kind: "side", side, participant: ctx.Identifier?.[0]?.image ?? "" }
  }

  seqMessage(ctx: Record<string, { image: string }[]>): SeqMessage {
    const ids = (ctx.Identifier ?? []).map((t) => t.image)
    const from = ids[0] ?? ""
    const to = ids[1] ?? ""

    if (ctx.FunctionRef) {
      const raw = ctx.FunctionRef[0].image
      // Parse: InterfaceId:FunctionId(rawParams)
      const match = raw.match(/^([A-Za-z_]\w*):([A-Za-z_]\w*)\(([^)]*)\)$/)
      if (match) {
        return {
          from, to,
          functionRef: { interfaceId: match[1], functionId: match[2], rawParams: match[3] },
          label: null,
        }
      }
    }

    const rawLabel = ctx.LabelText?.[0]?.image ?? null
    return {
      from, to,
      functionRef: null,
      label: rawLabel ? rawLabel.replace(/\\n/g, "\n") : null,
    }
  }
}

// Singleton visitor
const visitor = new SequenceDiagramVisitor()

export function buildSeqAst(cst: ReturnType<typeof import("./parser").seqParser.sequenceDiagram>): SeqAst {
  return visitor.visit(cst) as SeqAst
}
