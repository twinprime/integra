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
  /** The arrow type as written in the DSL (e.g. `->>`, `-->>`, `->`, `-->`, `-x`, `--x`, `-)`, `--)`). Maps 1:1 to Mermaid sequence diagram arrow syntax. */
  arrow: string
  /**
   * Discriminated union covering all possible message content kinds.
   * Adding a new kind here forces a compile error in every exhaustive switch consumer.
   */
  content: SeqMessageContent
}

/**
 * Discriminated union for message label content.
 * Use exhaustive switch + assertNever to ensure all kinds are handled.
 */
export type SeqMessageContent =
  | {
      kind: "functionRef"
      interfaceId: string
      functionId: string
      rawParams: string
      /** Optional display label shown instead of Interface:function(params) */
      label: string | null
    }
  | {
      /** UseCase:<path>(:label)? — path segments to a use case node */
      kind: "useCaseRef"
      path: string[]
      label: string | null
    }
  | {
      /** Sequence:<path>(:label)? — path segments to a sequence diagram node */
      kind: "seqDiagramRef"
      path: string[]
      label: string | null
    }
  | {
      kind: "label"
      text: string
    }
  | { kind: "none" }

export interface SeqNote {
  position:
    | { kind: "side"; side: "right" | "left"; participant: string }
    | { kind: "over"; participants: [string, string | null] }
  text: string
}

export interface SeqBlockSection {
  /** Condition / label text, or null if omitted */
  guard: string | null
  /** Statements in this section — may contain nested SeqBlocks */
  statements: SeqStatement[]
}

export interface SeqBlock {
  kind: "loop" | "alt" | "par" | "opt"
  sections: SeqBlockSection[]
}

/** Union of all statement types that can appear in a sequence diagram body */
export type SeqStatement = SeqMessage | SeqNote | SeqBlock

export interface SeqAst {
  declarations: SeqDeclaration[]
  /** Messages, notes, and blocks in source order. */
  statements: SeqStatement[]
}

// ─── Visitor ──────────────────────────────────────────────────────────────────

class SequenceDiagramVisitor extends BaseVisitor {
  constructor() {
    super()
    this.validateVisitor()
  }

  sequenceDiagram(ctx: Record<string, unknown[]>): SeqAst {
    const declarations: SeqDeclaration[] = []
    const statements: SeqStatement[] = []

    for (const stmt of ctx.seqStatement ?? []) {
      const result = this.visit(stmt as never) as SeqDeclaration | SeqStatement | undefined
      if (!result) continue
      if ("entityType" in result) declarations.push(result as SeqDeclaration)
      else statements.push(result as SeqStatement)
    }
    return { declarations, statements }
  }

  seqStatement(ctx: Record<string, unknown[]>): SeqDeclaration | SeqStatement {
    if (ctx.seqDeclaration) return this.visit(ctx.seqDeclaration as never) as SeqDeclaration
    if (ctx.seqNote) return this.visit(ctx.seqNote as never) as SeqNote
    if (ctx.seqBlock) return this.visit(ctx.seqBlock as never) as SeqBlock
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

  participantRef(ctx: Record<string, { image: string; startOffset: number }[]>): string {
    return [...(ctx.Identifier ?? []), ...(ctx.NumberToken ?? [])]
      .sort((a, b) => a.startOffset - b.startOffset)
      .map((t) => t.image)
      .join(" ")
  }

  seqNote(ctx: Record<string, { image: string }[]>): SeqNote {
    const position = this.visit(ctx.seqNotePosition as never) as SeqNote["position"]
    // NoteText is aliased to LabelText in the new lexer
    const rawText = ctx.LabelText?.[0]?.image ?? ""
    return { position, text: rawText.replace(/\\n/g, "\n") }
  }

  seqNotePosition(ctx: Record<string, unknown[]>): SeqNote["position"] {
    if (ctx.Over) {
      const [p1Ref, p2Ref] = ctx.participantRef as never[]
      const p1 = this.visit(p1Ref) as string
      const p2 = p2Ref != null ? (this.visit(p2Ref) as string) : null
      return { kind: "over", participants: [p1, p2] }
    }
    const [pRef] = ctx.participantRef as never[]
    const participant = this.visit(pRef) as string
    const side = (ctx.Right ?? []).length > 0 ? "right" : "left"
    return { kind: "side", side, participant }
  }

  seqMessage(ctx: Record<string, unknown[]>): SeqMessage {
    const [fromRef, toRef] = ctx.participantRef as never[]
    const from = this.visit(fromRef) as string
    const to = this.visit(toRef) as string
    const arrow = (ctx.SeqArrow as { image: string }[])[0].image

    if ((ctx.FunctionRef ?? []).length > 0) {
      const raw = (ctx.FunctionRef as { image: string }[])[0].image
      const match = raw.match(/^([A-Za-z_]\w*):([A-Za-z_]\w*)\(([^)]*)\)(?::(.*))?$/)
      if (match) {
        return {
          from, to, arrow,
          content: {
            kind: "functionRef",
            interfaceId: match[1],
            functionId: match[2],
            rawParams: match[3],
            label: match[4] ? match[4].replace(/\\n/g, "\n") : null,
          },
        }
      }
    }

    if ((ctx.UseCaseRef ?? []).length > 0) {
      const raw = (ctx.UseCaseRef as { image: string }[])[0].image
      const withoutPrefix = raw.slice("UseCase:".length)
      const secondColonIdx = withoutPrefix.indexOf(":")
      const pathStr = secondColonIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, secondColonIdx)
      const label = secondColonIdx === -1 ? null : (withoutPrefix.slice(secondColonIdx + 1) || null)?.replace(/\\n/g, "\n") ?? null
      const path = pathStr.split("/")
      return { from, to, arrow, content: { kind: "useCaseRef", path, label } }
    }

    if ((ctx.SequenceRef ?? []).length > 0) {
      const raw = (ctx.SequenceRef as { image: string }[])[0].image
      const withoutPrefix = raw.slice("Sequence:".length)
      const secondColonIdx = withoutPrefix.indexOf(":")
      const pathStr = secondColonIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, secondColonIdx)
      const label = secondColonIdx === -1 ? null : (withoutPrefix.slice(secondColonIdx + 1) || null)?.replace(/\\n/g, "\n") ?? null
      const path = pathStr.split("/")
      return { from, to, arrow, content: { kind: "seqDiagramRef", path, label } }
    }

    const rawLabel = (ctx.LabelText as { image: string }[] | undefined)?.[0]?.image ?? null
    const text = rawLabel ? rawLabel.replace(/\\n/g, "\n") : null
    return { from, to, arrow, content: text ? { kind: "label", text } : { kind: "none" } }
  }

  seqBlock(ctx: Record<string, unknown[]>): SeqBlock {
    const kindToken = (ctx.Loop ?? ctx.Alt ?? ctx.Par ?? ctx.Opt) as { image: string }[]
    const kind = kindToken[0].image as "loop" | "alt" | "par" | "opt"
    const guard = (ctx.BlockConditionText as { image: string }[] | undefined)?.[0]?.image?.trim() ?? null

    const firstSectionStatements = this._visitSectionStatements(ctx)
    const sections: SeqBlockSection[] = [{ guard, statements: firstSectionStatements }]

    for (const sectionNode of ctx.seqBlockSection ?? []) {
      sections.push(this.visit(sectionNode as never) as SeqBlockSection)
    }

    return { kind, sections }
  }

  seqBlockSection(ctx: Record<string, unknown[]>): SeqBlockSection {
    const guard = (ctx.BlockConditionText as { image: string }[] | undefined)?.[0]?.image?.trim() ?? null
    const statements = this._visitSectionStatements(ctx)
    return { guard, statements }
  }

  private _visitSectionStatements(ctx: Record<string, unknown[]>): SeqStatement[] {
    return (ctx.seqStatement ?? []).map(
      (s) => this.visit(s as never) as SeqStatement,
    ).filter(Boolean)
  }
}

// Singleton visitor
const visitor = new SequenceDiagramVisitor()

/** Recursively collects all SeqMessage nodes from a statement list, including those inside blocks. */
export function flattenMessages(statements: SeqStatement[]): SeqMessage[] {
  const result: SeqMessage[] = []
  for (const stmt of statements) {
    if ("sections" in stmt) {
      for (const section of (stmt as SeqBlock).sections) result.push(...flattenMessages(section.statements))
    } else if ("content" in stmt) {
      result.push(stmt as SeqMessage)
    }
  }
  return result
}

export function buildSeqAst(cst: ReturnType<typeof import("./parser").seqParser.sequenceDiagram>): SeqAst {
  return visitor.visit(cst) as SeqAst
}
