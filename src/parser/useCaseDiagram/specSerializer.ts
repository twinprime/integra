/**
 * specSerializer.ts — serialize UcdAst back to DSL spec text, and rename a
 * node ID inside a use-case diagram spec via AST (not regex).
 *
 * Round-trip trade-offs (by design):
 *  - Blank lines between statements are normalized
 *  - Whitespace normalized
 *  - Comments ARE preserved (stored in AST as UcdComment nodes)
 */
import { parseUseCaseDiagramCst } from "./parser"
import { buildUcdAst, type UcdAst, type UcdDeclaration, type UcdLink, type UcdStatement } from "./visitor"

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeDeclaration(decl: UcdDeclaration): string {
  const pathStr = decl.path.join("/")
  const aliasStr = decl.alias != null ? ` as ${decl.alias}` : ""
  const entityStr = decl.entityType === "use-case" ? "use case" : decl.entityType
  return `${entityStr} ${pathStr}${aliasStr}`
}

function serializeLink(link: UcdLink): string {
  const labelStr = link.label != null ? `: ${link.label}` : ""
  return `${link.from} ${link.arrow} ${link.to}${labelStr}`
}

function serializeStatement(stmt: UcdStatement): string {
  if ("entityType" in stmt) return serializeDeclaration(stmt)
  if ("from" in stmt) return serializeLink(stmt)
  return stmt.text // UcdComment
}

/** Serialize a UcdAst back to DSL spec text. Preserves source order including comments. */
export function ucdAstToSpec(ast: UcdAst): string {
  return ast.statements.map(serializeStatement).join("\n")
}

// ─── AST rename ───────────────────────────────────────────────────────────────

function renamePathSegments(path: string[], oldId: string, newId: string): string[] {
  return path.map((seg) => (seg === oldId ? newId : seg))
}

function renameDeclaration(decl: UcdDeclaration, oldId: string, newId: string): UcdDeclaration {
  const newPath = renamePathSegments(decl.path, oldId, newId)
  const newLastSeg = newPath[newPath.length - 1]
  const idChanged = decl.id === oldId && decl.alias === null
  return {
    ...decl,
    path: newPath,
    id: idChanged ? newLastSeg : decl.id,
  }
}

function renameLink(link: UcdLink, oldId: string, newId: string): UcdLink {
  return {
    ...link,
    from: link.from === oldId ? newId : link.from,
    to: link.to === oldId ? newId : link.to,
  }
}

function renameUcdStatement(stmt: UcdStatement, oldId: string, newId: string): UcdStatement {
  if ("entityType" in stmt) return renameDeclaration(stmt, oldId, newId)
  if ("from" in stmt) return renameLink(stmt, oldId, newId)
  return stmt // UcdComment — no IDs to rename
}

function renameInUcdAst(ast: UcdAst, oldId: string, newId: string): UcdAst {
  const statements = ast.statements.map((s) => renameUcdStatement(s, oldId, newId))
  return {
    declarations: statements.filter((s): s is UcdDeclaration => "entityType" in s),
    links: statements.filter((s): s is UcdLink => "from" in s),
    statements,
  }
}

/**
 * Parse a use-case diagram spec, rename all semantic occurrences of oldId to
 * newId (exact token match — no regex, no word-boundary ambiguity), then
 * serialize back to spec text.
 *
 * Returns the original content unchanged if it cannot be parsed.
 */
export function renameInUcdSpec(content: string, oldId: string, newId: string): string {
  if (!content.trim()) return content
  const { cst, lexErrors, parseErrors } = parseUseCaseDiagramCst(content)
  if (lexErrors.length || parseErrors.length) return content
  const ast = buildUcdAst(cst)
  const renamed = renameInUcdAst(ast, oldId, newId)
  return ucdAstToSpec(renamed)
}
