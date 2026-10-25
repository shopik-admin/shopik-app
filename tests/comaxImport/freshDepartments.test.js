import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
    resolveFreshDepartments,
    parseFreshDepartments,
    DEFAULT_FRESH_DEPARTMENTS,
    FRESH_DEPARTMENTS_KEY
} from '../../server/api/comax_product/freshDepartments.js'

const ORIGINAL_ENV = process.env.COMAX_FRESH_DEPARTMENTS

afterEach(() => {
    if (ORIGINAL_ENV == null) delete process.env.COMAX_FRESH_DEPARTMENTS
    else process.env.COMAX_FRESH_DEPARTMENTS = ORIGINAL_ENV
})

function makeDL(value) {
    return {
        Setting: {
            readOne: async ({ key }) => {
                assert.equal(key, FRESH_DEPARTMENTS_KEY)
                return value == null ? null : { value }
            }
        }
    }
}

describe('fresh department list', () => {
    it('seeds the 15 non-stock counters', () => {
        assert.equal(DEFAULT_FRESH_DEPARTMENTS.length, 15)
        assert.ok(DEFAULT_FRESH_DEPARTMENTS.includes('13'))
        assert.ok(DEFAULT_FRESH_DEPARTMENTS.includes('54'))
    })

    it('falls back to the seeded list when nothing is configured', async () => {
        delete process.env.COMAX_FRESH_DEPARTMENTS

        assert.deepEqual(await resolveFreshDepartments(makeDL(null)), DEFAULT_FRESH_DEPARTMENTS)
    })

    it('reads a comma separated list from the setting', async () => {
        process.env.COMAX_FRESH_DEPARTMENTS = '1,2'

        assert.deepEqual(await resolveFreshDepartments(makeDL('13, 9,54')), ['13', '9', '54'])
    })

    it('accepts an array setting', async () => {
        assert.deepEqual(await resolveFreshDepartments(makeDL(['13', '9'])), ['13', '9'])
    })

    it('falls back to the env variable when there is no setting', async () => {
        process.env.COMAX_FRESH_DEPARTMENTS = '13,9'

        assert.deepEqual(await resolveFreshDepartments(makeDL(null)), ['13', '9'])
    })

    it('ignores an empty setting and uses the env variable', async () => {
        process.env.COMAX_FRESH_DEPARTMENTS = '13'

        assert.deepEqual(await resolveFreshDepartments(makeDL('')), ['13'])
    })

    it('drops invalid codes and duplicates', () => {
        assert.deepEqual(parseFreshDepartments('13,abc,,13,9, 13 '), ['13', '9'])
    })

    it('survives a failing setting read', async () => {
        delete process.env.COMAX_FRESH_DEPARTMENTS
        const DL = { Setting: { readOne: async () => { throw new Error('redis down') } } }

        assert.deepEqual(await resolveFreshDepartments(DL), DEFAULT_FRESH_DEPARTMENTS)
    })
})
