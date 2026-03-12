/**
 * visitor.ts — Chevrotain CST visitor that produces a UcdAst from the parse tree.
 */
import { ucdParser } from "./parser"

const BaseVisitor = ucdParser.getBaseCstVisitorConstructorWithDefaults()

// ─── AST types ────────────────────────────────────────────────────────────────

export type UcdEntityType = "actor" | "component" | "use-case"

export interface UcdDeclaration {
  entityType: UcdEntityType
  /** Path segments as written, e.g. ["root", "sim"] or ["login"] */
  path: string[]
  /** Explicit alias from `as <id>`, or null if omitted */
  alias: string | null
  /** Resolved id: alias if present, else last path segment */
  id: string
}

export interface UcdLink {
  from: string
  to: string
  arrow: string
  label: string | null
}

export interface UcdComment {
  /** Full comment text including the leading `#` */
  text: string
}

/** Union of all statement types in a use case diagram body (in source order) */
export type UcdStatement = UcdDeclaration | UcdLink | UcdComment

export interface UcdAst {
  declarations: UcdDeclaration[]
  links: UcdLink[]
  /** All statements in source order, including comments. Used by the serializer for round-trip fidelity. */
  statements: UcdStatement[]
}

// ─── Visitor ──────────────────────────────────────────────────────────────────

class UseCaseDiagramVisitor extends BaseVisitor {
  constructor() {
    super()
    this.validateVisitor()
  }

  useCaseDiagram(ctx: Record<string, unknown[]>): UcdAst {
    const declarations: UcdDeclaration[] = []
    const links: UcdLink[] = []
    const statements: UcdStatement[] = []

    for (const stmt of ctx.ucdStatement ?? []) {
      const result = this.visit(stmt as never) as UcdStatement | undefined
      if (!result) continue
      if ("entityType" in result) {
        declarations.push(result)
        statements.push(result)
      } else if ("from" in result) {
        links.push(result)
        statements.push(result)
      } else {
        statements.push(result) // UcdComment
      }
    }
    return { declarations, links, statements }
  }

  ucdStatement(ctx: Record<string, unknown[]>): UcdStatement {
    if (ctx.ucdDeclaration) return this.visit(ctx.ucdDeclaration as never) as UcdDeclaration
    if (ctx.ucdComment) return this.visit(ctx.ucdComment as never) as UcdComment
    return this.visit(ctx.ucdLink as never) as UcdLink
  }

  ucdComment(ctx: Record<string, { image: string }[]>): UcdComment {
    return { text: ctx.UcdComment[0].image }
  }

  ucdDeclaration(ctx: Record<string, unknown[]>): UcdDeclaration {
    const entityType = this.visit(ctx.ucdEntityType as never) as UcdEntityType
    const path = this.visit(ctx.nodePath as never) as string[]
    const identifiers = ctx.Identifier as { image: string }[] | undefined
    const alias = identifiers?.[0]?.image ?? null
    return {
      entityType,
      path,
      alias,
      id: alias ?? path[path.length - 1],
    }
  }

  ucdEntityType(ctx: Record<string, unknown>): UcdEntityType {
    if (ctx.Actor) return "actor"
    if (ctx.Component) return "component"
    return "use-case"
  }

  nodePath(ctx: Record<string, { image: string }[]>): string[] {
    return (ctx.Identifier ?? []).map((t) => t.image)
  }

  ucdLink(ctx: Record<string, { image: string }[]>): UcdLink {
    const ids = (ctx.Identifier ?? []).map((t) => t.image)
    const arrow = (ctx.UcdArrow ?? [])[0]?.image ?? "->>"
    const label = (ctx.UcdLabelText ?? [])[0]?.image?.trim() ?? null
    return { from: ids[0] ?? "", to: ids[1] ?? "", arrow, label }
  }
}

// Singleton visitor
const visitor = new UseCaseDiagramVisitor()

export function buildUcdAst(cst: ReturnType<typeof import("./parser").ucdParser.useCaseDiagram>): UcdAst {
  return visitor.visit(cst) as UcdAst
}
