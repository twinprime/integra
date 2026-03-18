/**
 * Tests for ucdAstToSpec (round-trip) and renameInUcdSpec (AST-based rename).
 */
import { describe, it, expect } from 'vitest'
import { ucdAstToSpec, renameInUcdSpec } from './specSerializer'
import { parseUseCaseDiagramCst } from './parser'
import { buildUcdAst } from './visitor'

function roundTrip(content: string): string {
    const { cst } = parseUseCaseDiagramCst(content)
    return ucdAstToSpec(buildUcdAst(cst))
}

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe('ucdAstToSpec — round-trip', () => {
    it('round-trips an actor declaration', () => {
        expect(roundTrip('actor login')).toBe('actor login')
    })

    it('round-trips a component declaration', () => {
        expect(roundTrip('component AuthService')).toBe('component AuthService')
    })

    it('round-trips a use case declaration', () => {
        expect(roundTrip('use case placeOrder')).toBe('use case placeOrder')
    })

    it('round-trips a path declaration', () => {
        expect(roundTrip('actor root/customer')).toBe('actor root/customer')
    })

    it('round-trips an alias declaration', () => {
        expect(roundTrip('actor userId as customer')).toBe('actor userId as customer')
    })

    it('round-trips a link', () => {
        expect(roundTrip('actor user\nuse case login\nuser ->> login')).toBe(
            'actor user\nuse case login\nuser ->> login'
        )
    })

    it('round-trips a link with non-default arrow type', () => {
        expect(roundTrip('user --> login')).toBe('user --> login')
    })

    it('round-trips a link with a label', () => {
        expect(roundTrip('user ->> login: initiates')).toBe('user ->> login: initiates')
    })

    it('round-trips a link with arrow type and label', () => {
        expect(roundTrip('user --o login: extends')).toBe('user --o login: extends')
    })

    it('normalizes blank lines (acceptable trade-off)', () => {
        expect(roundTrip('actor user\n\nuse case login')).toBe('actor user\nuse case login')
    })
})

// ─── renameInUcdSpec ──────────────────────────────────────────────────────────

describe('renameInUcdSpec — declarations', () => {
    it('renames an actor declaration', () => {
        expect(renameInUcdSpec('actor login', 'login', 'signIn')).toBe('actor signIn')
    })

    it('renames a component declaration', () => {
        expect(renameInUcdSpec('component AuthService', 'AuthService', 'Auth')).toBe(
            'component Auth'
        )
    })

    it('renames a use case declaration', () => {
        expect(renameInUcdSpec('use case placeOrder', 'placeOrder', 'createOrder')).toBe(
            'use case createOrder'
        )
    })

    it('renames a path segment in a path declaration', () => {
        expect(renameInUcdSpec('actor root/customer as c', 'customer', 'user')).toBe(
            'actor root/user as c'
        )
    })

    it('does NOT rename inside an alias', () => {
        expect(renameInUcdSpec('actor userId as customer', 'customer', 'user')).toBe(
            'actor userId as customer'
        )
    })
})

describe('renameInUcdSpec — links', () => {
    it('renames the from side of a link', () => {
        expect(renameInUcdSpec('actor login\nuse case uc\nlogin ->> uc', 'login', 'signIn')).toBe(
            'actor signIn\nuse case uc\nsignIn ->> uc'
        )
    })

    it('renames the to side of a link', () => {
        expect(
            renameInUcdSpec(
                'actor user\nuse case placeOrder\nuser ->> placeOrder',
                'placeOrder',
                'createOrder'
            )
        ).toBe('actor user\nuse case createOrder\nuser ->> createOrder')
    })

    it('preserves arrow type when renaming', () => {
        expect(
            renameInUcdSpec('actor user\nuse case login\nuser --o login', 'login', 'signIn')
        ).toBe('actor user\nuse case signIn\nuser --o signIn')
    })

    it('preserves label when renaming', () => {
        expect(
            renameInUcdSpec(
                'actor user\nuse case login\nuser ->> login: initiates',
                'login',
                'signIn'
            )
        ).toBe('actor user\nuse case signIn\nuser ->> signIn: initiates')
    })
})

describe('renameInUcdSpec — underscore prefix safety', () => {
    it('does NOT corrupt an underscored ID when renaming a prefix', () => {
        const spec = 'actor api\ncomponent api_service\napi ->> api_service'
        const result = renameInUcdSpec(spec, 'api', 'gateway')
        expect(result).toContain('actor gateway')
        expect(result).toContain('component api_service')
        expect(result).toContain('gateway ->> api_service')
    })

    it('correctly renames an underscored ID itself', () => {
        const result = renameInUcdSpec(
            'actor api_user\nuse case uc\napi_user ->> uc',
            'api_user',
            'customer'
        )
        expect(result).toContain('actor customer')
        expect(result).toContain('customer ->> uc')
    })
})

describe('renameInUcdSpec — no false positives', () => {
    it('does not rename a partial match inside a longer id', () => {
        const spec = 'use case placeOrder\nactor user\nuser ->> placeOrder'
        expect(renameInUcdSpec(spec, 'place', 'create')).toBe(spec)
    })
})

describe('renameInUcdSpec — invalid spec fallback', () => {
    it('returns original content when spec cannot be parsed', () => {
        const bad = '@@@ invalid spec'
        expect(renameInUcdSpec(bad, 'login', 'signIn')).toBe(bad)
    })

    it('returns empty string unchanged', () => {
        expect(renameInUcdSpec('', 'login', 'signIn')).toBe('')
    })
})

// ─── UCD comment round-trip ───────────────────────────────────────────────────

describe('ucdAstToSpec — comment round-trip', () => {
    it('round-trips a standalone comment line', () => {
        expect(roundTrip('# just a comment')).toBe('# just a comment')
    })

    it('preserves comment between declaration and link', () => {
        const input = 'actor user\n# a comment\nuser ->> login'
        expect(roundTrip(input)).toBe(input)
    })

    it('preserves leading comment before any declarations', () => {
        const input = '# header\nactor user\nuse case login'
        expect(roundTrip(input)).toBe(input)
    })

    it('preserves trailing comment after all statements', () => {
        const input = 'actor user\nuse case login\n# footer'
        expect(roundTrip(input)).toBe(input)
    })

    it('preserves multiple consecutive comments', () => {
        const input = '# line 1\n# line 2\nactor user'
        expect(roundTrip(input)).toBe(input)
    })
})

describe('renameInUcdSpec — comment lines are preserved verbatim after rename', () => {
    it('keeps comment lines unchanged when renaming an actor id', () => {
        const spec = 'actor user\n# this is a note\nuser ->> login'
        const result = renameInUcdSpec(spec, 'user', 'customer')
        expect(result).toBe('actor customer\n# this is a note\ncustomer ->> login')
    })
})
