import { parseSequenceDiagramCst } from "../parser/sequenceDiagram/parser"
import { buildSeqAst, type SeqAst } from "../parser/sequenceDiagram/visitor"

const cache = new Map<string, SeqAst>()

export function getCachedSeqAst(content: string): SeqAst {
  if (!content.trim()) return { declarations: [], statements: [] }
  if (cache.has(content)) return cache.get(content)!
  const { cst } = parseSequenceDiagramCst(content)
  const ast = buildSeqAst(cst)
  cache.set(content, ast)
  return ast
}

export function clearSeqAstCache(): void {
  cache.clear()
}
