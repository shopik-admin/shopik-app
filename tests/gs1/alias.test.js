import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    aliasCandidates,
    aliasEnabled,
    aliasMinLen,
    resolveAlias
} from '../../server/services/gs1/alias.js'

const GTIN = '7290004645748'
const env = { ...process.env }

afterEach(() => {
    if (env.GS1_ALIAS_MIN_LEN === undefined) delete process.env.GS1_ALIAS_MIN_LEN
    else process.env.GS1_ALIAS_MIN_LEN = env.GS1_ALIAS_MIN_LEN
    if (env.GS1_ALIAS_ENABLED === undefined) delete process.env.GS1_ALIAS_ENABLED
    else process.env.GS1_ALIAS_ENABLED = env.GS1_ALIAS_ENABLED
})

describe('GS1 long → short alias candidates', () => {
    it('derives every proper suffix, longest first', () => {
        assert.deepEqual(aliasCandidates(GTIN, 6), [
            '290004645748',
            '90004645748',
            '0004645748',
            '004645748',
            '04645748',
            '4645748',
            '645748'
        ])
        assert.ok(aliasCandidates(GTIN, 6).includes('645748'))
    })

    it('honours the minimum length', () => {
        const candidates = aliasCandidates(GTIN, 7)
        assert.ok(!candidates.includes('645748'))
        assert.ok(candidates.includes('4645748'))
    })

    it('never returns the GTIN itself or a non-numeric value', () => {
        assert.ok(!aliasCandidates(GTIN, 1).includes(GTIN))
        assert.deepEqual(aliasCandidates('72A004645748', 6), [])
        assert.deepEqual(aliasCandidates('', 6), [])
    })

    it('keeps leading zeros significant', () => {
        const zeroed = '7290000123456'
        assert.ok(aliasCandidates(zeroed, 6).includes('0123456'))
        assert.ok(aliasCandidates(zeroed, 6).includes('123456'))
        assert.deepEqual(
            resolveAlias(zeroed, new Set(['0123456', '123456']), 6),
            { ambiguous: ['0123456', '123456'] }
        )
    })

    it('defaults the minimum length to 6', () => {
        delete process.env.GS1_ALIAS_MIN_LEN
        assert.equal(aliasMinLen(), 6)
    })
})

describe('resolveAlias', () => {
    it('resolves a unique suffix match', () => {
        const set = new Set(['645748'])
        assert.deepEqual(resolveAlias(GTIN, set, 6), { short: '645748' })
    })

    it('reports every distinct short when more than one matches', () => {
        const set = new Set(['645748', '4645748'])
        assert.deepEqual(resolveAlias(GTIN, set, 6), { ambiguous: ['4645748', '645748'] })
    })

    it('returns null when no suffix exists', () => {
        assert.equal(resolveAlias(GTIN, new Set(['999999']), 6), null)
    })

    it('accepts an explicit manual mapping that is not a suffix', () => {
        const set = new Set(['111111'])
        assert.deepEqual(resolveAlias(GTIN, set, 6, '111111'), { short: '111111', manual: true })
        assert.equal(resolveAlias(GTIN, set, 6, '222222'), null)
    })

    it('prefers a manual mapping even when suffixes match', () => {
        const set = new Set(['645748', '4645748'])
        assert.deepEqual(resolveAlias(GTIN, set, 6, '4645748'), { short: '4645748', manual: true })
    })

    it('can be disabled', () => {
        process.env.GS1_ALIAS_ENABLED = '0'
        assert.equal(aliasEnabled(), false)
        assert.equal(resolveAlias(GTIN, new Set(['645748']), 6), null)
        // An explicit admin mapping is still honoured.
        assert.deepEqual(resolveAlias(GTIN, new Set(['645748']), 6, '645748'), { short: '645748', manual: true })
    })
})
