/**
 * specSerializer.ts — serialize UcdAst back to DSL spec text, and rename a
 * node ID inside a use-case diagram spec via AST (not regex).
 *
 * Round-trip trade-offs (by design):
 *  - Blank lines between statements are normalized
 *  - Whitespace normalized
 *  - Comments not preserved (not stored in AST)
 */
import { parseUseCaseDiagramCst } from "./parser"
import { buildUcdAst, type UcdAst, type UcdDeclaration, type UcdLink } from "./visitor"

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeDeclaration(decl: UcdDeclaration): string {
  const pathStr = decl.path.join("/")
  const aliasStr = decl.alias != null ? ` as ${decl.alias}` : ""
  const entityStr = decl.entityType === "use-case" ? "use case" : decl.entityType
  return `${entityStr} ${pathStr}${aliasStr}`
}

function serializeLink(link: UcdLink): string {
  return `${link.from} --> ${link.to}`
}

/** Serialize a UcdAst back to DSL spec text. */
export function ucdAstToSpec(ast: UcdAst): string {
  const lines: string[] = [
    ...ast.declarations.map(serializeDeclaration),
    ...ast.links.map(serializeLink),
  ]
  return lines.join("\n")
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
    from: link.from === oldId ? newId : link.from,
    to: link.to === oldId ? newId : link.to,
  }
}

function renameInUcdAst(ast: UcdAst, oldId: string, newId: string): UcdAst {
  return {
    declarations: ast.declarations.map((d) => renameDeclaration(d, oldId, newId)),
    links: ast.links.map((l) => renameLink(l, oldId, newId)),
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
