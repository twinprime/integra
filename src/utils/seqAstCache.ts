import { parseSequenceDiagramCst } from '../parser/sequenceDiagram/parser'
import { buildSeqAst, type SeqAst } from '../parser/sequenceDiagram/visitor'

const LRU_MAX = 100

// Simple LRU using Map insertion order: evict the oldest entry when at capacity.
const cache = new Map<string, SeqAst>()

export function getCachedSeqAst(content: string): SeqAst {
    if (!content.trim()) return { declarations: [], statements: [] }
    const hit = cache.get(content)
    if (hit !== undefined) {
        // Refresh LRU order: move to end
        cache.delete(content)
        cache.set(content, hit)
        return hit
    }
    const { cst } = parseSequenceDiagramCst(content)
    const ast = buildSeqAst(cst)
    if (cache.size >= LRU_MAX) {
        // Evict the oldest (first) entry
        cache.delete(cache.keys().next().value!)
    }
    cache.set(content, ast)
    return ast
}

export function clearSeqAstCache(): void {
    cache.clear()
}

export function seqAstCacheSize(): number {
    return cache.size
}
