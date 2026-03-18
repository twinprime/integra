/**
 * Shared helpers for sequence-diagram tests.
 */
import { parseSequenceDiagramCst } from './parser'
import { buildSeqAst } from './visitor'
import type { ComponentNode } from '../../store/types'
import type { SeqMessage, SeqNote } from './visitor'

export function parse(input: string) {
    const { cst, lexErrors, parseErrors } = parseSequenceDiagramCst(input)
    const ast = buildSeqAst(cst)
    const messages = ast.statements.filter((s): s is SeqMessage => 'content' in s)
    const notes = ast.statements.filter((s): s is SeqNote => 'position' in s)
    return { ast: { ...ast, messages, notes }, lexErrors, parseErrors }
}

export function parseAst(content: string) {
    const { cst } = parseSequenceDiagramCst(content)
    return buildSeqAst(cst)
}

export const makeComp = (
    uuid: string,
    id: string,
    subComponents: ComponentNode[] = []
): ComponentNode => ({
    uuid,
    id,
    name: id,
    type: 'component',
    actors: [],
    subComponents,
    useCaseDiagrams: [],
    interfaces: [],
})

export const makeNamedComp = (
    uuid: string,
    id: string,
    name: string,
    subComponents: ComponentNode[] = []
): ComponentNode => ({
    uuid,
    id,
    name,
    type: 'component',
    actors: [],
    subComponents,
    useCaseDiagrams: [],
    interfaces: [],
})
