/**
 * Tests for seqAstToSpec (round-trip) and renameInSeqSpec (AST-based rename).
 */
import { describe, it, expect } from 'vitest'
import { seqAstToSpec, renameInSeqSpec } from './specSerializer'
import { parseSequenceDiagramCst } from './parser'
import { buildSeqAst } from './visitor'

function roundTrip(content: string): string {
    const { cst } = parseSequenceDiagramCst(content)
    return seqAstToSpec(buildSeqAst(cst))
}

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe('seqAstToSpec — round-trip', () => {
    it('round-trips a simple actor declaration', () => {
        expect(roundTrip('actor login')).toBe('actor login')
    })

    it('round-trips a component declaration', () => {
        expect(roundTrip('component AuthService')).toBe('component AuthService')
    })

    it('round-trips a path declaration', () => {
        expect(roundTrip('component root/payment/checkout')).toBe('component root/payment/checkout')
    })

    it('round-trips an alias declaration', () => {
        expect(roundTrip('actor userId as customer')).toBe('actor userId as customer')
    })

    it('round-trips a plain message', () => {
        expect(roundTrip('a ->> b: some label')).toBe('a ->> b: some label')
    })

    it('round-trips an X-prefixed message', () => {
        expect(roundTrip('a X->> b: some label')).toBe('a X->> b: some label')
    })

    it('round-trips a function-ref message', () => {
        expect(roundTrip('a ->> b: REST:getUser(id: string)')).toBe(
            'a ->> b: REST:getUser(id: string)'
        )
    })

    it('round-trips a function-ref message with display label suffix', () => {
        expect(roundTrip('a ->> b: REST:getUser(id: string):fetch user')).toBe(
            'a ->> b: REST:getUser(id: string):fetch user'
        )
    })

    it('round-trips a function-ref message with empty params and display label', () => {
        expect(roundTrip('a ->> b: IFace:doWork():do the work')).toBe(
            'a ->> b: IFace:doWork():do the work'
        )
    })

    it('round-trips a UseCase-ref message', () => {
        expect(roundTrip('a ->> b: UseCase:root/orders/placeOrder')).toBe(
            'a ->> b: UseCase:root/orders/placeOrder'
        )
    })

    it('round-trips a UseCase-ref message with custom label', () => {
        expect(roundTrip('a ->> b: UseCase:placeOrder:Place an Order')).toBe(
            'a ->> b: UseCase:placeOrder:Place an Order'
        )
    })

    it('round-trips a UseCaseDiagram-ref message', () => {
        expect(roundTrip('a ->> b: UseCaseDiagram:root/orders/checkoutFlows')).toBe(
            'a ->> b: UseCaseDiagram:root/orders/checkoutFlows'
        )
    })

    it('round-trips a UseCaseDiagram-ref message with custom label', () => {
        expect(roundTrip('a ->> b: UseCaseDiagram:checkoutFlows:Checkout Flows')).toBe(
            'a ->> b: UseCaseDiagram:checkoutFlows:Checkout Flows'
        )
    })

    it('round-trips a Sequence-ref message', () => {
        expect(roundTrip('a ->> b: Sequence:auth/loginFlow')).toBe(
            'a ->> b: Sequence:auth/loginFlow'
        )
    })

    it('round-trips a Sequence-ref message with custom label', () => {
        expect(roundTrip('a ->> b: Sequence:loginFlow:Log In')).toBe(
            'a ->> b: Sequence:loginFlow:Log In'
        )
    })

    it('round-trips a bare message with no label', () => {
        expect(roundTrip('a ->> b')).toBe('a ->> b')
    })

    it('round-trips a note right of', () => {
        expect(roundTrip('actor a\nnote right of a: some text')).toBe(
            'actor a\nnote right of a: some text'
        )
    })

    it('round-trips a note left of', () => {
        expect(roundTrip('actor a\nnote left of a: text')).toBe('actor a\nnote left of a: text')
    })

    it('round-trips a note over one participant', () => {
        expect(roundTrip('actor a\nnote over a: text')).toBe('actor a\nnote over a: text')
    })

    it('round-trips a note over two participants', () => {
        expect(roundTrip('actor a\ncomponent b\nnote over a,b: spanning')).toBe(
            'actor a\ncomponent b\nnote over a,b: spanning'
        )
    })

    it('normalizes blank lines (acceptable trade-off)', () => {
        // Blank lines are stripped — the AST doesn't store them
        expect(roundTrip('actor a\n\ncomponent b')).toBe('actor a\ncomponent b')
    })
})

// ─── renameInSeqSpec ──────────────────────────────────────────────────────────

describe('renameInSeqSpec — declaration', () => {
    it('renames a single-segment actor declaration', () => {
        expect(renameInSeqSpec('actor login', 'login', 'signIn')).toBe('actor signIn')
    })

    it('renames a single-segment component declaration', () => {
        expect(renameInSeqSpec('component AuthService', 'AuthService', 'Auth')).toBe(
            'component Auth'
        )
    })

    it('renames a matching path segment in a path declaration', () => {
        expect(renameInSeqSpec('component root/customer as c', 'customer', 'user')).toBe(
            'component root/user as c'
        )
    })

    it('renames the last segment of a path declaration', () => {
        expect(renameInSeqSpec('component root/orders/checkout', 'checkout', 'purchase')).toBe(
            'component root/orders/purchase'
        )
    })

    it('does NOT rename an alias — alias is display-only', () => {
        // alias 'c' stays; we are renaming 'customer' (the path segment)
        expect(renameInSeqSpec('actor customer as c', 'customer', 'user')).toBe('actor user as c')
    })
})

describe('renameInSeqSpec — messages', () => {
    it('renames message sender', () => {
        expect(renameInSeqSpec('actor login\nlogin ->> server: call', 'login', 'signIn')).toBe(
            'actor signIn\nsignIn ->> server: call'
        )
    })

    it('renames message receiver', () => {
        expect(renameInSeqSpec('actor a\na ->> login: call', 'login', 'signIn')).toBe(
            'actor a\na ->> signIn: call'
        )
    })

    it('renames interface ID in function-ref message', () => {
        expect(
            renameInSeqSpec('a ->> b: OrdersAPI:place(id: string)', 'OrdersAPI', 'OrdersV2')
        ).toBe('a ->> b: OrdersV2:place(id: string)')
    })

    it('renames function ID in function-ref message', () => {
        expect(renameInSeqSpec('a ->> b: REST:getUser(id: string)', 'getUser', 'fetchUser')).toBe(
            'a ->> b: REST:fetchUser(id: string)'
        )
    })

    it('renames a segment in UseCase path reference', () => {
        expect(
            renameInSeqSpec(
                'a ->> b: UseCase:root/recorder/rec_stream',
                'recorder',
                'media_recorder'
            )
        ).toBe('a ->> b: UseCase:root/media_recorder/rec_stream')
    })

    it('renames the use case ID in a UseCase path reference', () => {
        expect(renameInSeqSpec('a ->> b: UseCase:placeOrder', 'placeOrder', 'createOrder')).toBe(
            'a ->> b: UseCase:createOrder'
        )
    })

    it('renames a UseCase path reference with custom label without touching the label text', () => {
        expect(
            renameInSeqSpec(
                'a ->> b: UseCase:root/orders/placeOrder:Place an order',
                'placeOrder',
                'createOrder'
            )
        ).toBe('a ->> b: UseCase:root/orders/createOrder:Place an order')
    })
})

describe('renameInSeqSpec — Sequence: references', () => {
    it('renames a Sequence: reference ID', () => {
        expect(renameInSeqSpec('a ->> b: Sequence:loginFlow', 'loginFlow', 'authFlow')).toBe(
            'a ->> b: Sequence:authFlow'
        )
    })

    it('renames a segment in Sequence: path reference', () => {
        expect(renameInSeqSpec('a ->> b: Sequence:auth/loginFlow', 'auth', 'identity')).toBe(
            'a ->> b: Sequence:identity/loginFlow'
        )
    })

    it('renames a Sequence: reference with custom label without touching the label', () => {
        expect(renameInSeqSpec('a ->> b: Sequence:loginFlow:Log In', 'loginFlow', 'authFlow')).toBe(
            'a ->> b: Sequence:authFlow:Log In'
        )
    })

    it('does NOT rename the custom label text even when it matches the old ID', () => {
        expect(
            renameInSeqSpec('a ->> b: Sequence:loginFlow:loginFlow', 'loginFlow', 'authFlow')
        ).toBe('a ->> b: Sequence:authFlow:loginFlow')
    })
})

describe('renameInSeqSpec — UseCaseDiagram: references', () => {
    it('renames a UseCaseDiagram: reference ID', () => {
        expect(
            renameInSeqSpec('a ->> b: UseCaseDiagram:checkoutFlows', 'checkoutFlows', 'orderFlows')
        ).toBe('a ->> b: UseCaseDiagram:orderFlows')
    })

    it('renames a UseCaseDiagram: reference path segment without touching the label', () => {
        expect(
            renameInSeqSpec(
                'a ->> b: UseCaseDiagram:root/orders/checkoutFlows:Checkout Flows',
                'orders',
                'commerce'
            )
        ).toBe('a ->> b: UseCaseDiagram:root/commerce/checkoutFlows:Checkout Flows')
    })
})

describe('renameInSeqSpec — notes', () => {
    it('renames participant in note right of', () => {
        expect(renameInSeqSpec('actor a\nnote right of a: text', 'a', 'alpha')).toBe(
            'actor alpha\nnote right of alpha: text'
        )
    })

    it('renames participant in note left of', () => {
        expect(renameInSeqSpec('actor a\nnote left of a: text', 'a', 'alpha')).toBe(
            'actor alpha\nnote left of alpha: text'
        )
    })

    it('renames first participant in note over', () => {
        expect(renameInSeqSpec('actor a\ncomponent b\nnote over a,b: text', 'a', 'alpha')).toBe(
            'actor alpha\ncomponent b\nnote over alpha,b: text'
        )
    })

    it('renames second participant in note over', () => {
        expect(renameInSeqSpec('actor a\ncomponent b\nnote over a,b: text', 'b', 'beta')).toBe(
            'actor a\ncomponent beta\nnote over a,beta: text'
        )
    })
})

describe('renameInSeqSpec — underscore prefix safety', () => {
    it('does NOT rename a prefix when underscored sibling exists', () => {
        const spec = 'component api\ncomponent api_gateway\napi ->> api_gateway: REST:call()'
        const result = renameInSeqSpec(spec, 'api', 'service')
        expect(result).toContain('component service')
        expect(result).toContain('component api_gateway')
        expect(result).toContain('service ->> api_gateway')
    })

    it('correctly renames an underscored ID itself', () => {
        const result = renameInSeqSpec(
            'component api_gateway\napi_gateway ->> svc: REST:get()',
            'api_gateway',
            'gateway'
        )
        expect(result).toContain('component gateway')
        expect(result).toContain('gateway ->> svc')
    })

    it('does not affect a message arrow that looks similar (login-->)', () => {
        const result = renameInSeqSpec(
            'actor login\nlogin ->> server: REST:auth()',
            'login',
            'signIn'
        )
        expect(result).toBe('actor signIn\nsignIn ->> server: REST:auth()')
    })
})

describe('renameInSeqSpec — no false positives', () => {
    it('does not rename partial match inside longer id', () => {
        // 'place' must not rename 'placeOrder'
        const spec = 'actor placeOrder\nplaceOrder ->> svc: REST:call()'
        expect(renameInSeqSpec(spec, 'place', 'create')).toBe(spec)
    })

    it('does not rename inside a plain label text', () => {
        // Plain label text is not parsed as a semantic reference — stored verbatim in AST
        // (label property). Since we do not touch label content, it is preserved unchanged.
        const spec = 'actor a\na ->> b: go to login now'
        expect(renameInSeqSpec(spec, 'login', 'signIn')).toBe(spec)
    })
})

describe('renameInSeqSpec — invalid spec fallback', () => {
    it('returns original content when spec cannot be parsed', () => {
        const bad = 'this is not valid DSL @@@@'
        expect(renameInSeqSpec(bad, 'login', 'signIn')).toBe(bad)
    })

    it('returns empty string unchanged', () => {
        expect(renameInSeqSpec('', 'login', 'signIn')).toBe('')
    })
})

// ─── Indentation preservation ─────────────────────────────────────────────────

describe('seqAstToSpec — indentation preservation', () => {
    it('round-trips a loop with 2-space indented body', () => {
        const spec = 'actor a\nloop\n  a ->> b: call\nend'
        expect(roundTrip(spec)).toBe(spec)
    })

    it('round-trips a loop with 4-space indented body', () => {
        const spec = 'actor a\nopt condition\n    a ->> b: call\nend'
        expect(roundTrip(spec)).toBe(spec)
    })

    it('round-trips a loop with tab-indented body', () => {
        const spec = 'actor a\nloop\n\ta ->> b: call\nend'
        expect(roundTrip(spec)).toBe(spec)
    })

    it('round-trips a nested block preserving both indent levels', () => {
        const spec = 'actor a\nloop outer\n  opt inner\n    a ->> b: call\n  end\nend'
        expect(roundTrip(spec)).toBe(spec)
    })

    it('round-trips an alt with else preserving all indents', () => {
        const spec = 'actor a\nalt success\n  a ->> b: ok\nelse failure\n  a ->> b: fail\nend'
        expect(roundTrip(spec)).toBe(spec)
    })

    it('preserves indentation of notes inside a block', () => {
        const spec = 'actor a\nloop\n  note right of a: some text\nend'
        expect(roundTrip(spec)).toBe(spec)
    })

    it('preserves indentation when renaming a participant inside an indented block', () => {
        const input = 'actor a\nloop\n  a ->> b: call\nend'
        const output = 'actor user\nloop\n  user ->> b: call\nend'
        expect(renameInSeqSpec(input, 'a', 'user')).toBe(output)
    })
})

// ─── Comment preservation ─────────────────────────────────────────────────────

describe('seqAstToSpec — comment preservation', () => {
    it('round-trips a top-level comment line', () => {
        const spec = 'actor a\n# this is a comment\na ->> b: call'
        expect(roundTrip(spec)).toBe(spec)
    })

    it('round-trips an indented comment inside a block', () => {
        const spec = 'actor a\nloop\n  # fetch data\n  a ->> b: call\nend'
        expect(roundTrip(spec)).toBe(spec)
    })

    it('round-trips a comment between messages', () => {
        const spec = 'actor a\na ->> b: first\n# mid-flow comment\na ->> b: second'
        expect(roundTrip(spec)).toBe(spec)
    })

    it('does not alter comment text when renaming a matching ID', () => {
        const spec = 'actor a\n# participant a sends a message\na ->> b: call'
        expect(renameInSeqSpec(spec, 'a', 'user')).toBe(
            'actor user\n# participant a sends a message\nuser ->> b: call'
        )
    })
})

// ─── activate / deactivate round-trip ────────────────────────────────────────

describe('seqAstToSpec — activate/deactivate round-trip', () => {
    it('round-trips a standalone activate statement', () => {
        expect(roundTrip('actor user\nactivate user')).toBe('actor user\nactivate user')
    })

    it('round-trips a standalone deactivate statement', () => {
        expect(roundTrip('actor user\ndeactivate user')).toBe('actor user\ndeactivate user')
    })

    it('round-trips activate / message / deactivate sequence', () => {
        const spec = 'actor a\nactor b\nactivate a\na ->> b: call\ndeactivate a'
        expect(roundTrip(spec)).toBe(spec)
    })

    it('round-trips activate/deactivate inside a block (indentation preserved)', () => {
        const spec =
            'actor a\nactor b\nloop retry\n  activate a\n  a ->> b: go\n  deactivate a\nend'
        expect(roundTrip(spec)).toBe(spec)
    })
})

describe('renameInSeqSpec — activate/deactivate participant rename', () => {
    it('renames participant in activate statement', () => {
        const spec = 'actor user\nactivate user\ndeactivate user'
        expect(renameInSeqSpec(spec, 'user', 'customer')).toBe(
            'actor customer\nactivate customer\ndeactivate customer'
        )
    })

    it('does not rename unrelated participants in activate', () => {
        const spec = 'actor a\nactor b\nactivate a\ndeactivate a'
        expect(renameInSeqSpec(spec, 'b', 'service')).toBe(
            'actor a\nactor service\nactivate a\ndeactivate a'
        )
    })
})
