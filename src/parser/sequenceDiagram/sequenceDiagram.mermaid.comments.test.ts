import { describe, it, expect } from 'vitest'
import { parseSequenceDiagramCst } from './parser'
import { buildSeqAst } from './visitor'
import { generateSequenceMermaidFromAst } from './mermaidGenerator'

describe('sequence diagram comment lines — mermaid generator', () => {
    const owner = {
        uuid: 'o',
        id: 'owner',
        name: 'owner',
        type: 'component' as const,
        actors: [],
        subComponents: [],
        useCaseDiagrams: [],
        interfaces: [],
    }
    const root = { ...owner, uuid: 'r', id: 'root', subComponents: [owner] }

    // Regression test for bug: comment line (#) caused "invalid diagram syntax"
    it('generates valid mermaid when spec contains a top-level comment line', () => {
        const { cst } = parseSequenceDiagramCst('actor a\nactor b\n# a comment\na ->> b: hello')
        const ast = buildSeqAst(cst)
        expect(() => generateSequenceMermaidFromAst(ast, owner, root)).not.toThrow()
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('a->>b: hello')
        expect(mermaidContent).not.toContain('undefined')
    })

    it('generates valid mermaid when comment appears between messages', () => {
        const { cst } = parseSequenceDiagramCst(
            'actor a\nactor b\na ->> b: first\n# mid comment\na ->> b: second'
        )
        const ast = buildSeqAst(cst)
        expect(() => generateSequenceMermaidFromAst(ast, owner, root)).not.toThrow()
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('a->>b: first')
        expect(mermaidContent).toContain('a->>b: second')
        expect(mermaidContent).not.toContain('undefined')
    })
})
