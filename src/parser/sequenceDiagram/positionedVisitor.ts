/**
 * positionedVisitor.ts — Sequence diagram CST visitor that extracts
 * { from, to, uuid } navigation entries for click-to-navigate in CodeMirror.
 *
 * Two phases per invocation:
 *  1. Walk all declarations to build the participant map (id → uuid).
 *  2. Walk all statements to emit NavEntry objects for navigatable tokens.
 */
import type { CstNode, IToken } from "chevrotain"
import { seqParser, parseSequenceDiagramCst } from "./parser"
import type { ComponentNode } from "../../store/types"
import {
  resolveParticipant,
  findComponentByInterfaceId,
  resolveUseCaseByPath,
} from "../../utils/diagramResolvers"

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

const BaseVisitor = seqParser.getBaseCstVisitorConstructorWithDefaults()

class SeqPositionedVisitorImpl extends BaseVisitor {
  private _root!: ComponentNode
  private _ownerComp!: ComponentNode | null
  private _ownerCompUuid!: string
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
    ownerCompUuid?: string,
  ): NavEntry[] {
    this._root = root
    this._ownerComp = ownerComp
    this._ownerCompUuid = ownerCompUuid ?? ownerComp?.uuid ?? ""
    this._participantMap = new Map()
    this._entries = []
    this._buildParticipantMap(cst)
    this.visit(cst)
    return this._entries
  }

  // ─── Phase 1: collect participant map ──────────────────────────────────────

  private _buildParticipantMap(cst: CstNode): void {
    for (const stmt of nodes(cst.children, "seqStatement")) {
      const decls = nodes(stmt.children, "seqDeclaration")
      if (decls.length > 0) this._resolveDecl(decls[0])
    }
  }

  private _resolveDecl(decl: CstNode): void {
    const c = decl.children
    const keyword = (toks(c, "Actor")[0] ?? toks(c, "Component")[0])?.image ?? "actor"
    const nodePathNode = nodes(c, "nodePath")[0]
    if (!nodePathNode) return
    const pathTokens = toks(nodePathNode.children, "Identifier")
    const pathIds = pathTokens.map((t) => t.image)
    const aliasToken = toks(c, "Identifier")[0] ?? null
    const id = aliasToken?.image ?? pathIds[pathIds.length - 1]
    if (!id) return
    const fromPath = pathIds.length > 1 ? pathIds.join("/") : undefined
    const uuid = resolveParticipant(keyword, id, fromPath, this._root, this._ownerComp)
    if (uuid) this._participantMap.set(id, uuid)
  }

  // ─── Phase 2: emit nav entries ────────────────────────────────────────────

  sequenceDiagram(ctx: ChildDict): void {
    for (const stmt of nodes(ctx, "seqStatement")) {
      this.visit(stmt)
    }
  }

  seqStatement(ctx: ChildDict): void {
    const decl = nodes(ctx, "seqDeclaration")[0]
    if (decl) { this.visit(decl); return }
    const note = nodes(ctx, "seqNote")[0]
    if (note) { this.visit(note); return }
    const msg = nodes(ctx, "seqMessage")[0]
    if (msg) this.visit(msg)
  }

  seqDeclaration(ctx: ChildDict): void {
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

  seqNote(ctx: ChildDict): void {
    for (const notePos of nodes(ctx, "seqNotePosition")) {
      this.visit(notePos)
    }
  }

  seqNotePosition(ctx: ChildDict): void {
    for (const pRef of nodes(ctx, "participantRef")) {
      this._addParticipantRef(pRef)
    }
  }

  seqMessage(ctx: ChildDict): void {
    const [fromRef, toRef] = nodes(ctx, "participantRef")
    if (fromRef) this._addParticipantRef(fromRef)
    if (toRef) this._addParticipantRef(toRef)
    // FunctionRef → navigate to component by interface id
    const fnRef = toks(ctx, "FunctionRef")[0]
    if (fnRef) {
      const match = fnRef.image.match(/^([A-Za-z_]\w*):/)
      if (match) {
        const uuid = findComponentByInterfaceId(this._root, match[1])
        if (uuid) this._entries.push({ from: fnRef.startOffset, to: tokenEnd(fnRef), uuid })
      }
    }
    // UseCaseRef → navigate to use case node
    const ucRef = toks(ctx, "UseCaseRef")[0]
    if (ucRef && this._ownerComp) {
      // Strip "UseCase:" prefix, take path before optional second colon
      const withoutPrefix = ucRef.image.slice("UseCase:".length)
      const secondColonIdx = withoutPrefix.indexOf(":")
      const pathStr = secondColonIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, secondColonIdx)
      const path = pathStr.split("/")
      const uuid = resolveUseCaseByPath(path, this._root, this._ownerComp, this._ownerCompUuid)
      if (uuid) this._entries.push({ from: ucRef.startOffset, to: tokenEnd(ucRef), uuid })
    }
  }

  private _addParticipantRef(pRef: CstNode): void {
    const idToks = toks(pRef.children, "Identifier")
    const id = idToks.map((t) => t.image).join(" ")
    const uuid = this._participantMap.get(id)
    if (!uuid) return
    for (const t of idToks) {
      this._entries.push({ from: t.startOffset, to: tokenEnd(t), uuid })
    }
  }

  // nodePath and participantRef are accessed via .children directly, not via visit()
  nodePath(_ctx: ChildDict): void { /* no-op: accessed via children */ }
  participantRef(_ctx: ChildDict): void { /* no-op: accessed via _addParticipantRef */ }
}

const seqPositionedVisitor = new SeqPositionedVisitorImpl()

export function buildSeqNavEntries(
  doc: string,
  root: ComponentNode,
  ownerComp: ComponentNode | null,
  ownerCompUuid?: string,
): NavEntry[] {
  const { cst } = parseSequenceDiagramCst(doc)
  return seqPositionedVisitor.run(cst as unknown as CstNode, root, ownerComp, ownerCompUuid)
}
