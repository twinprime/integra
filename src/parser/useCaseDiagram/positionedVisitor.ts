/**
 * positionedVisitor.ts — Use-case diagram CST visitor that extracts
 * { from, to, uuid } navigation entries for click-to-navigate in CodeMirror.
 */
import type { CstNode, IToken } from "chevrotain"
import { ucdParser, parseUseCaseDiagramCst } from "./parser"
import type { ComponentNode } from "../../store/types"
import { resolveDiagramDeclarationUuid } from "../../utils/diagramResolvers"

export interface NavEntry {
  from: number
  to: number
  uuid: string
}

// ─── Type helpers ─────────────────────────────────────────────────────────────

type ChildDict = Record<string, (CstNode | IToken)[]>

function toks(children: ChildDict, name: string): IToken[] {
  return (children[name] ?? []) as IToken[]
}

function nodes(children: ChildDict, name: string): CstNode[] {
  return (children[name] ?? []) as CstNode[]
}

function tokenEnd(t: IToken): number {
  return t.startOffset + t.image.length
}

// ─── Visitor ─────────────────────────────────────────────────────────────────

const BaseVisitor = ucdParser.getBaseCstVisitorConstructorWithDefaults()

class UcdPositionedVisitorImpl extends BaseVisitor {
  private _root!: ComponentNode
  private _ownerComp!: ComponentNode | null
  private _participantMap!: Map<string, string>
  private _entries!: NavEntry[]

  constructor() {
    super()
    this.validateVisitor()
  }

  run(
    cst: CstNode,
    root: ComponentNode,
    ownerComp: ComponentNode | null,
  ): NavEntry[] {
    this._root = root
    this._ownerComp = ownerComp
    this._participantMap = new Map()
    this._entries = []
    this._buildParticipantMap(cst)
    this.visit(cst)
    return this._entries
  }

  // ─── Phase 1: collect participant map ──────────────────────────────────────

  private _buildParticipantMap(cst: CstNode): void {
    for (const stmt of nodes(cst.children, "ucdStatement")) {
      const decls = nodes(stmt.children, "ucdDeclaration")
      if (decls.length > 0) this._resolveDecl(decls[0])
    }
  }

  private _resolveDecl(decl: CstNode): void {
    const c = decl.children
    const entityTypeNode = nodes(c, "ucdEntityType")[0]
    if (!entityTypeNode) return
    const keyword = this._entityTypeKeyword(entityTypeNode)
    const nodePathNode = nodes(c, "nodePath")[0]
    if (!nodePathNode) return
    const pathTokens = toks(nodePathNode.children, "Identifier")
    const pathIds = pathTokens.map((t) => t.image)
    const aliasToken = toks(c, "Identifier")[0] ?? null
    const id = aliasToken?.image ?? pathIds[pathIds.length - 1]
    if (!id) return
    const fromPath = pathIds.length > 1 ? pathIds.join("/") : undefined
    const uuid = resolveDiagramDeclarationUuid(keyword, id, fromPath, this._root, this._ownerComp)
    if (uuid) this._participantMap.set(id, uuid)
  }

  private _entityTypeKeyword(node: CstNode): string {
    const c = node.children
    if ((toks(c, "Actor").length)) return "actor"
    if ((toks(c, "Component").length)) return "component"
    return "use case"
  }

  // ─── Phase 2: emit nav entries ────────────────────────────────────────────

  useCaseDiagram(ctx: ChildDict): void {
    for (const stmt of nodes(ctx, "ucdStatement")) {
      this.visit(stmt)
    }
  }

  ucdStatement(ctx: ChildDict): void {
    const decl = nodes(ctx, "ucdDeclaration")[0]
    if (decl) { this.visit(decl); return }
    const link = nodes(ctx, "ucdLink")[0]
    if (link) this.visit(link)
  }

  ucdDeclaration(ctx: ChildDict): void {
    const nodePathNode = nodes(ctx, "nodePath")[0]
    if (!nodePathNode) return
    const pathTokens = toks(nodePathNode.children, "Identifier")
    const aliasToken = toks(ctx, "Identifier")[0] ?? null
    const pathIds = pathTokens.map((t) => t.image)
    const id = aliasToken?.image ?? pathIds[pathIds.length - 1]
    if (!id) return
    const navToken = aliasToken ?? pathTokens[pathTokens.length - 1]
    const uuid = this._participantMap.get(id)
    if (uuid && navToken) {
      this._entries.push({ from: navToken.startOffset, to: tokenEnd(navToken), uuid })
    }
  }

  ucdEntityType(_ctx: ChildDict): void { /* accessed via _entityTypeKeyword */ }

  ucdLink(ctx: ChildDict): void {
    const idToks = toks(ctx, "Identifier")
    for (const tok of idToks) {
      const uuid = this._participantMap.get(tok.image)
      if (uuid) this._entries.push({ from: tok.startOffset, to: tokenEnd(tok), uuid })
    }
  }

  // nodePath is accessed via .children directly
  nodePath(_ctx: ChildDict): void { /* no-op */ }
}

const ucdPositionedVisitor = new UcdPositionedVisitorImpl()

export function buildUcdNavEntries(
  doc: string,
  root: ComponentNode,
  ownerComp: ComponentNode | null,
): NavEntry[] {
  const { cst } = parseUseCaseDiagramCst(doc)
  return ucdPositionedVisitor.run(cst as unknown as CstNode, root, ownerComp)
}
