/**
 * Block and activation syntax tests for sequence diagrams.
 */
import { describe, it, expect } from 'vitest'
import { SeqLexer } from './lexer'
import { parseSequenceDiagramCst } from './parser'
import { buildSeqAst, type SeqBlock, type SeqMessage, type SeqActivation } from './visitor'
import { generateSequenceMermaidFromAst } from './mermaidGenerator'
import { seqAstToSpec, renameInSeqSpec } from './specSerializer'
import { parseSequenceDiagram } from './systemUpdater'
import { makeNamedComp } from './sequenceDiagram.test.helpers'
import type { ComponentNode } from '../../store/types'

function parseBlock(input: string): SeqBlock {
    const { cst } = parseSequenceDiagramCst(input)
    const ast = buildSeqAst(cst)
    const block = ast.statements.find((s): s is SeqBlock => 'sections' in s)
    if (!block) throw new Error('no SeqBlock found in AST')
    return block
}

describe('sequence diagram block constructs — visitor', () => {
    it('parses a loop block with condition text', () => {
        const block = parseBlock('actor A\nactor B\nloop check every second\n  A ->> B: ping\nend')
        expect(block.kind).toBe('loop')
        expect(block.sections).toHaveLength(1)
        expect(block.sections[0].guard).toBe('check every second')
        const msg = block.sections[0].statements[0] as SeqMessage
        expect(msg.from).toBe('A')
        expect(msg.to).toBe('B')
    })

    it('parses a loop block without condition text', () => {
        const block = parseBlock('actor A\nactor B\nloop\n  A ->> B: ping\nend')
        expect(block.kind).toBe('loop')
        expect(block.sections[0].guard).toBeNull()
    })

    it('parses an alt block with multiple else branches', () => {
        const block = parseBlock(
            'actor A\nactor B\nalt happy path\n  A ->> B: ok\nelse error\n  A ->> B: err\nelse\n  A ->> B: default\nend'
        )
        expect(block.kind).toBe('alt')
        expect(block.sections).toHaveLength(3)
        expect(block.sections[0].guard).toBe('happy path')
        expect(block.sections[1].guard).toBe('error')
        expect(block.sections[2].guard).toBeNull()
        expect(
            ((block.sections[0].statements[0] as SeqMessage).content as { text: string }).text
        ).toBe('ok')
        expect(
            ((block.sections[1].statements[0] as SeqMessage).content as { text: string }).text
        ).toBe('err')
        expect(
            ((block.sections[2].statements[0] as SeqMessage).content as { text: string }).text
        ).toBe('default')
    })

    it('parses a par block with and sections', () => {
        const block = parseBlock(
            'actor A\nactor B\nactor C\nactor D\npar group 1\n  A ->> B: msg1\nand group 2\n  C ->> D: msg2\nend'
        )
        expect(block.kind).toBe('par')
        expect(block.sections).toHaveLength(2)
        expect(block.sections[0].guard).toBe('group 1')
        expect(block.sections[1].guard).toBe('group 2')
    })

    it('parses nested blocks (loop inside alt)', () => {
        const spec = 'actor A\nactor B\nalt outer\n  loop inner\n    A ->> B: ping\n  end\nend'
        const { cst } = parseSequenceDiagramCst(spec)
        const ast = buildSeqAst(cst)
        const outer = ast.statements.find((s): s is SeqBlock => 'sections' in s)!
        expect(outer.kind).toBe('alt')
        const inner = outer.sections[0].statements.find((s): s is SeqBlock => 'sections' in s)!
        expect(inner.kind).toBe('loop')
        expect((inner.sections[0].statements[0] as SeqMessage).from).toBe('A')
    })
})

describe('sequence diagram block constructs — mermaid generator', () => {
    const mkComp = (uuid: string, id: string): ComponentNode => ({
        uuid,
        id,
        name: id,
        type: 'component',
        actors: [],
        subComponents: [],
        useCaseDiagrams: [],
        interfaces: [],
    })

    it('emits loop block in mermaid output', () => {
        const spec = 'actor A\nactor B\nloop check\n  A ->> B: ping\nend'
        const { cst } = parseSequenceDiagramCst(spec)
        const ast = buildSeqAst(cst)
        const owner = mkComp('o', 'owner')
        const root = { ...mkComp('r', 'root'), subComponents: [owner] }
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('loop check')
        expect(mermaidContent).toContain('end')
        expect(mermaidContent).toContain('A->>B: ping')
    })

    it('emits alt/else/end in mermaid output', () => {
        const spec = 'actor A\nactor B\nalt good\n  A ->> B: ok\nelse bad\n  A ->> B: err\nend'
        const { cst } = parseSequenceDiagramCst(spec)
        const ast = buildSeqAst(cst)
        const owner = mkComp('o', 'owner')
        const root = { ...mkComp('r', 'root'), subComponents: [owner] }
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('alt good')
        expect(mermaidContent).toContain('else bad')
        expect(mermaidContent).toContain('end')
    })

    it('emits par/and/end in mermaid output', () => {
        const spec =
            'actor A\nactor B\nactor C\nactor D\npar g1\n  A ->> B: m1\nand g2\n  C ->> D: m2\nend'
        const { cst } = parseSequenceDiagramCst(spec)
        const ast = buildSeqAst(cst)
        const owner = mkComp('o', 'owner')
        const root = { ...mkComp('r', 'root'), subComponents: [owner] }
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('par g1')
        expect(mermaidContent).toContain('and g2')
        expect(mermaidContent).toContain('end')
    })

    it('auto-declares participants referenced only inside a block', () => {
        const spec = 'actor A\nloop\n  A ->> B: msg\nend'
        const { cst } = parseSequenceDiagramCst(spec)
        const ast = buildSeqAst(cst)
        const owner = mkComp('o', 'owner')
        const root = { ...mkComp('r', 'root'), subComponents: [owner] }
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        // B is not declared but should appear as a participant
        expect(mermaidContent).toContain('B')
    })
})

describe('sequence diagram block constructs — spec serializer', () => {
    it('round-trips a loop block', () => {
        const { cst } = parseSequenceDiagramCst(
            'actor A\nactor B\nloop check\n  A ->> B: ping\nend'
        )
        const ast = buildSeqAst(cst)
        const spec = seqAstToSpec(ast)
        expect(spec).toContain('loop check')
        expect(spec).toContain('end')
        expect(spec).toContain('A ->> B: ping')
    })

    it('round-trips an alt block with else branches', () => {
        const input = 'actor A\nactor B\nalt good\n  A ->> B: ok\nelse bad\n  A ->> B: err\nend'
        const { cst } = parseSequenceDiagramCst(input)
        const ast = buildSeqAst(cst)
        const spec = seqAstToSpec(ast)
        expect(spec).toContain('alt good')
        expect(spec).toContain('else bad')
        expect(spec).toContain('end')
    })

    it('renames participant ID inside a block', () => {
        const input = 'actor A\nactor B\nloop\n  A ->> B: ping\nend'
        const renamed = renameInSeqSpec(input, 'A', 'Alpha')
        expect(renamed).toContain('actor Alpha')
        expect(renamed).toContain('Alpha ->> B: ping')
        expect(renamed).not.toContain('A ->>')
    })

    it('renames participant ID inside nested blocks', () => {
        const input = 'actor A\nactor B\nalt outer\n  loop inner\n    A ->> B: ping\n  end\nend'
        const renamed = renameInSeqSpec(input, 'B', 'Beta')
        expect(renamed).toContain('actor Beta')
        expect(renamed).toContain('A ->> Beta: ping')
        expect(renamed).not.toContain('->> B:')
    })
})

describe('sequence diagram block constructs — system updater', () => {
    const mkComp2 = (uuid: string, id: string, subs: ComponentNode[] = []): ComponentNode => ({
        uuid,
        id,
        name: id,
        type: 'component',
        actors: [],
        subComponents: subs,
        useCaseDiagrams: [],
        interfaces: [],
    })

    it('derives interface spec from messages inside a loop block', () => {
        const child = mkComp2('child-uuid', 'svc')
        const owner = mkComp2('owner-uuid', 'owner', [child])
        const root = mkComp2('root-uuid', 'root', [owner])
        const spec = 'component svc\nactor caller\nloop retry\n  caller ->> svc: IFace:fn()\nend'
        const result = parseSequenceDiagram(spec, root, owner.uuid, 'diag-uuid')
        const updatedOwner = result.subComponents.find((c) => c.uuid === owner.uuid)!
        const updatedSvc = updatedOwner.subComponents.find((c) => c.id === 'svc')!
        const fn = updatedSvc.interfaces
            .find((i) => i.id === 'IFace')
            ?.functions.find((f) => f.id === 'fn')
        expect(fn).toBeDefined()
    })

    it('derives interface spec from messages inside nested blocks', () => {
        const child = mkComp2('child-uuid', 'svc')
        const owner = mkComp2('owner-uuid', 'owner', [child])
        const root = mkComp2('root-uuid', 'root', [owner])
        const spec =
            'component svc\nactor caller\nalt branch\n  loop retry\n    caller ->> svc: IFace:doWork()\n  end\nend'
        const result = parseSequenceDiagram(spec, root, owner.uuid, 'diag-uuid')
        const updatedOwner = result.subComponents.find((c) => c.uuid === owner.uuid)!
        const updatedSvc = updatedOwner.subComponents.find((c) => c.id === 'svc')!
        const fn = updatedSvc.interfaces
            .find((i) => i.id === 'IFace')
            ?.functions.find((f) => f.id === 'doWork')
        expect(fn).toBeDefined()
    })
})

// ─── opt block construct ──────────────────────────────────────────────────────

describe('sequence diagram opt block — visitor', () => {
    it('parses an opt block with condition text', () => {
        const block = parseBlock('actor A\nactor B\nopt if premium user\n  A ->> B: upgrade\nend')
        expect(block.kind).toBe('opt')
        expect(block.sections).toHaveLength(1)
        expect(block.sections[0].guard).toBe('if premium user')
        const msg = block.sections[0].statements[0] as SeqMessage
        expect(msg.from).toBe('A')
        expect(msg.to).toBe('B')
        expect((msg.content as { text: string }).text).toBe('upgrade')
    })

    it('parses an opt block without condition text', () => {
        const block = parseBlock('actor A\nactor B\nopt\n  A ->> B: ping\nend')
        expect(block.kind).toBe('opt')
        expect(block.sections[0].guard).toBeNull()
    })

    it('parses opt nested inside alt', () => {
        const spec = 'actor A\nactor B\nalt outer\n  opt inner\n    A ->> B: ping\n  end\nend'
        const { cst } = parseSequenceDiagramCst(spec)
        const ast = buildSeqAst(cst)
        const outer = ast.statements.find((s): s is SeqBlock => 'sections' in s)!
        expect(outer.kind).toBe('alt')
        const inner = outer.sections[0].statements.find((s): s is SeqBlock => 'sections' in s)!
        expect(inner.kind).toBe('opt')
    })
})

describe('sequence diagram opt block — mermaid generator', () => {
    const mkOptComp = (uuid: string, id: string): ComponentNode => ({
        uuid,
        id,
        name: id,
        type: 'component',
        actors: [],
        subComponents: [],
        useCaseDiagrams: [],
        interfaces: [],
    })

    it('emits opt block in mermaid output', () => {
        const spec = 'actor A\nactor B\nopt if premium\n  A ->> B: upgrade\nend'
        const { cst } = parseSequenceDiagramCst(spec)
        const ast = buildSeqAst(cst)
        const owner = mkOptComp('o', 'owner')
        const root = { ...mkOptComp('r', 'root'), subComponents: [owner] }
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('opt if premium')
        expect(mermaidContent).toContain('end')
        expect(mermaidContent).not.toContain('else')
        expect(mermaidContent).not.toContain('and')
    })
})

describe('sequence diagram opt block — spec serializer', () => {
    it('round-trips an opt block', () => {
        const { cst } = parseSequenceDiagramCst(
            'actor A\nactor B\nopt condition\n  A ->> B: ping\nend'
        )
        const ast = buildSeqAst(cst)
        const spec = seqAstToSpec(ast)
        expect(spec).toContain('opt condition')
        expect(spec).toContain('end')
        expect(spec).toContain('A ->> B: ping')
    })

    it('renames participant ID inside an opt block', () => {
        const input = 'actor A\nactor B\nopt\n  A ->> B: ping\nend'
        const renamed = renameInSeqSpec(input, 'A', 'Alpha')
        expect(renamed).toContain('actor Alpha')
        expect(renamed).toContain('Alpha ->> B: ping')
        expect(renamed).not.toContain('A ->>')
    })
})

describe('sequence diagram activate/deactivate — lexer', () => {
    it("tokenises 'activate user' with Activate token", () => {
        const { errors, tokens } = SeqLexer.tokenize('activate user')
        expect(errors).toHaveLength(0)
        const names = tokens.map((t) => t.tokenType.name)
        expect(names).toContain('Activate')
    })

    it("tokenises 'deactivate user' with Deactivate token", () => {
        const { errors, tokens } = SeqLexer.tokenize('deactivate user')
        expect(errors).toHaveLength(0)
        const names = tokens.map((t) => t.tokenType.name)
        expect(names).toContain('Deactivate')
    })

    it("does not treat 'activateUser' as Activate keyword (no word-boundary leak)", () => {
        const { errors, tokens } = SeqLexer.tokenize('activateUser ->> b: msg')
        expect(errors).toHaveLength(0)
        const names = tokens.map((t) => t.tokenType.name)
        expect(names).not.toContain('Activate')
    })

    it("does not treat 'deactivateUser' as Deactivate keyword", () => {
        const { errors, tokens } = SeqLexer.tokenize('deactivateUser ->> b: msg')
        expect(errors).toHaveLength(0)
        const names = tokens.map((t) => t.tokenType.name)
        expect(names).not.toContain('Deactivate')
    })
})

describe('sequence diagram activate/deactivate — visitor', () => {
    it("parses 'activate p' as SeqActivation with action activate", () => {
        const { cst } = parseSequenceDiagramCst('actor p\nactivate p')
        const ast = buildSeqAst(cst)
        const activations = ast.statements.filter((s): s is SeqActivation => 'action' in s)
        expect(activations).toHaveLength(1)
        expect(activations[0]).toMatchObject<SeqActivation>({
            action: 'activate',
            participant: 'p',
        })
    })

    it("parses 'deactivate p' as SeqActivation with action deactivate", () => {
        const { cst } = parseSequenceDiagramCst('actor p\ndeactivate p')
        const ast = buildSeqAst(cst)
        const activations = ast.statements.filter((s): s is SeqActivation => 'action' in s)
        expect(activations).toHaveLength(1)
        expect(activations[0]).toMatchObject<SeqActivation>({
            action: 'deactivate',
            participant: 'p',
        })
    })

    it('parses activate followed by message then deactivate', () => {
        const spec = 'actor a\nactor b\nactivate a\na ->> b: hello\ndeactivate a'
        const { cst } = parseSequenceDiagramCst(spec)
        const ast = buildSeqAst(cst)
        const activations = ast.statements.filter((s): s is SeqActivation => 'action' in s)
        expect(activations).toHaveLength(2)
        expect(activations[0].action).toBe('activate')
        expect(activations[1].action).toBe('deactivate')
    })

    it("activation nodes have no 'content' field (so flattenMessages excludes them)", () => {
        const { cst } = parseSequenceDiagramCst('actor p\nactivate p\ndeactivate p')
        const ast = buildSeqAst(cst)
        const activations = ast.statements.filter((s): s is SeqActivation => 'action' in s)
        expect(activations).toHaveLength(2)
        activations.forEach((s) => expect('content' in s).toBe(false))
    })
})

describe('sequence diagram activate/deactivate — mermaid generator', () => {
    const owner = makeNamedComp('owner-uuid', 'owner', 'owner')
    const root = makeNamedComp('root-uuid', 'root', 'root', [owner])

    it("emits 'activate <id>' in mermaid output", () => {
        const { cst } = parseSequenceDiagramCst('actor user\nactivate user')
        const ast = buildSeqAst(cst)
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('activate user')
    })

    it("emits 'deactivate <id>' in mermaid output", () => {
        const { cst } = parseSequenceDiagramCst('actor user\ndeactivate user')
        const ast = buildSeqAst(cst)
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('deactivate user')
    })

    it('emits activate/deactivate around a message inside a block', () => {
        const spec =
            'actor a\nactor b\nloop retry\n  activate a\n  a ->> b: go\n  deactivate a\nend'
        const { cst } = parseSequenceDiagramCst(spec)
        const ast = buildSeqAst(cst)
        const { mermaidContent } = generateSequenceMermaidFromAst(ast, owner, root)
        expect(mermaidContent).toContain('activate a')
        expect(mermaidContent).toContain('deactivate a')
        expect(mermaidContent).toContain('a->>b: go')
    })
})
