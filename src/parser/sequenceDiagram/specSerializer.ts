/**
 * specSerializer.ts — serialize SeqAst back to DSL spec text, and rename a
 * node ID inside a sequence diagram spec via AST (not regex).
 *
 * Round-trip trade-offs (by design):
 *  - Blank lines between statements are normalized (one statement per line)
 *  - Leading/trailing whitespace normalized
 *  - Comments are not preserved (not stored in AST)
 */
import { parseSequenceDiagramCst } from './parser'
import {
    buildSeqAst,
    type SeqAst,
    type SeqDeclaration,
    type SeqMessage,
    type SeqMessageContent,
    type SeqNote,
    type SeqBlock,
    type SeqBlockSection,
    type SeqStatement,
} from './visitor'

// Compile-time exhaustiveness guard
function assertNever(x: never): never {
    throw new Error(`Unhandled SeqMessageContent kind: ${JSON.stringify(x)}`)
}

/** Re-escape actual newline characters back to the literal \n escape sequence. */
function escapeText(text: string): string {
    return text.replace(/\n/g, '\\n')
}

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeDeclaration(decl: SeqDeclaration): string {
    const pathStr = decl.path.join('/')
    const aliasStr = decl.alias != null ? ` as ${decl.alias}` : ''
    return `${decl.entityType} ${pathStr}${aliasStr}`
}

function serializeMessage(msg: SeqMessage): string {
    const serializedArrow = msg.excludeFromDependencies ? `X${msg.arrow}` : msg.arrow
    const base = `${msg.from} ${serializedArrow} ${msg.to}`
    const c = msg.content
    switch (c.kind) {
        case 'functionRef': {
            const labelSuffix = c.label != null ? `:${escapeText(c.label)}` : ''
            return `${base}: ${c.interfaceId}:${c.functionId}(${c.rawParams})${labelSuffix}`
        }
        case 'useCaseRef': {
            const labelStr = c.label != null ? `:${escapeText(c.label)}` : ''
            return `${base}: UseCase:${c.path.join('/')}${labelStr}`
        }
        case 'seqDiagramRef': {
            const labelStr = c.label != null ? `:${escapeText(c.label)}` : ''
            return `${base}: Sequence:${c.path.join('/')}${labelStr}`
        }
        case 'label':
            return `${base}: ${escapeText(c.text)}`
        case 'none':
            return base
        default:
            return assertNever(c)
    }
}

function serializeNote(note: SeqNote): string {
    const pos = note.position
    let posStr: string
    if (pos.kind === 'side') {
        posStr = `note ${pos.side} of ${pos.participant}`
    } else {
        const [p1, p2] = pos.participants
        posStr = p2 != null ? `note over ${p1},${p2}` : `note over ${p1}`
    }
    return `${posStr}: ${escapeText(note.text)}`
}

function sectionKeyword(kind: 'loop' | 'alt' | 'par' | 'opt'): string {
    return kind === 'alt' ? 'else' : 'and'
}

function serializeBlock(block: SeqBlock): string {
    const bi = block.indent ?? ''
    const lines: string[] = []
    const [first, ...rest] = block.sections
    const headerGuard = first.guard ? ` ${first.guard}` : ''
    lines.push(`${bi}${block.kind}${headerGuard}`)
    lines.push(...serializeStatements(first.statements))
    for (const section of rest) {
        const secGuard = section.guard ? ` ${section.guard}` : ''
        const si = section.indent ?? bi
        lines.push(`${si}${sectionKeyword(block.kind)}${secGuard}`)
        lines.push(...serializeStatements(section.statements))
    }
    lines.push(`${bi}end`)
    return lines.join('\n')
}

function serializeStatements(statements: SeqStatement[]): string[] {
    return statements.map((stmt) => {
        if ('sections' in stmt) return serializeBlock(stmt)
        if ('position' in stmt) return (stmt.indent ?? '') + serializeNote(stmt)
        if ('action' in stmt) return (stmt.indent ?? '') + `${stmt.action} ${stmt.participant}`
        if ('from' in stmt) return (stmt.indent ?? '') + serializeMessage(stmt)
        return (stmt.indent ?? '') + stmt.text // SeqComment
    })
}

/** Serialize a SeqAst back to DSL spec text. */
export function seqAstToSpec(ast: SeqAst): string {
    const lines: string[] = [
        ...ast.declarations.map(serializeDeclaration),
        ...serializeStatements(ast.statements),
    ]
    return lines.join('\n')
}

// ─── AST rename ───────────────────────────────────────────────────────────────

function renamePathSegments(path: string[], oldId: string, newId: string): string[] {
    return path.map((seg) => (seg === oldId ? newId : seg))
}

function renameDeclaration(decl: SeqDeclaration, oldId: string, newId: string): SeqDeclaration {
    const newPath = renamePathSegments(decl.path, oldId, newId)
    // Re-derive id: alias is display-only and does not carry the node ID semantically
    const newLastSeg = newPath[newPath.length - 1]
    const idChanged = decl.id === oldId && decl.alias === null
    return {
        ...decl,
        path: newPath,
        id: idChanged ? newLastSeg : decl.id,
    }
}

function renameMessageContent(
    c: SeqMessageContent,
    oldId: string,
    newId: string
): SeqMessageContent {
    switch (c.kind) {
        case 'functionRef':
            return {
                ...c,
                interfaceId: c.interfaceId === oldId ? newId : c.interfaceId,
                functionId: c.functionId === oldId ? newId : c.functionId,
            }
        case 'useCaseRef':
            return { ...c, path: renamePathSegments(c.path, oldId, newId) }
        case 'seqDiagramRef':
            return { ...c, path: renamePathSegments(c.path, oldId, newId) }
        case 'label':
        case 'none':
            return c
        default:
            return assertNever(c)
    }
}

function renameMessage(msg: SeqMessage, oldId: string, newId: string): SeqMessage {
    return {
        ...msg,
        from: msg.from === oldId ? newId : msg.from,
        to: msg.to === oldId ? newId : msg.to,
        content: renameMessageContent(msg.content, oldId, newId),
    }
}

function renameNote(note: SeqNote, oldId: string, newId: string): SeqNote {
    const pos = note.position
    if (pos.kind === 'side') {
        return {
            ...note,
            position: { ...pos, participant: pos.participant === oldId ? newId : pos.participant },
        }
    }
    const [p1, p2] = pos.participants
    return {
        ...note,
        position: {
            ...pos,
            participants: [
                p1 === oldId ? newId : p1,
                p2 != null ? (p2 === oldId ? newId : p2) : null,
            ],
        },
    }
}

function renameBlockSection(
    section: SeqBlockSection,
    oldId: string,
    newId: string
): SeqBlockSection {
    return { ...section, statements: renameStatements(section.statements, oldId, newId) }
}

function renameStatements(
    statements: SeqStatement[],
    oldId: string,
    newId: string
): SeqStatement[] {
    return statements.map((stmt) => {
        if ('sections' in stmt) {
            const block = stmt
            return {
                ...block,
                sections: block.sections.map((s) => renameBlockSection(s, oldId, newId)),
            }
        }
        if ('position' in stmt) return renameNote(stmt, oldId, newId)
        if ('action' in stmt) {
            const activation = stmt
            return {
                ...activation,
                participant: activation.participant === oldId ? newId : activation.participant,
            }
        }
        if (!('from' in stmt)) return stmt // SeqComment — no IDs to rename, pass through unchanged
        return renameMessage(stmt, oldId, newId)
    })
}

function renameInSeqAst(ast: SeqAst, oldId: string, newId: string): SeqAst {
    return {
        declarations: ast.declarations.map((d) => renameDeclaration(d, oldId, newId)),
        statements: renameStatements(ast.statements, oldId, newId),
    }
}

/**
 * Parse a sequence diagram spec, rename all semantic occurrences of oldId to
 * newId (exact token match — no regex, no word-boundary ambiguity), then
 * serialize back to spec text.
 *
 * Returns the original content unchanged if it cannot be parsed.
 */
export function renameInSeqSpec(content: string, oldId: string, newId: string): string {
    if (!content.trim()) return content
    const { cst, lexErrors, parseErrors } = parseSequenceDiagramCst(content)
    if (lexErrors.length || parseErrors.length) return content
    const ast = buildSeqAst(cst)
    const renamed = renameInSeqAst(ast, oldId, newId)
    return seqAstToSpec(renamed)
}
