import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { FLAGS_HEADER } from '../../common/constants/categoryFlags.js'
import { buildFlagsTemplate } from '../../common/functions/buildFlagsTemplate.js'
import { parseFlagsCsv } from '../../server/services/categoryMap/flags.js'

describe('flags CSV template', () => {
    it('starts with the exact required header row, in order', () => {
        const [header] = buildFlagsTemplate().split('\r\n')

        assert.deepEqual(header.split(','), FLAGS_HEADER)
    })

    it('adds a sample row with empty description columns and TRUE/FALSE flags', () => {
        const [, sample] = buildFlagsTemplate().split('\r\n')
        const cells = sample.split(',')

        assert.equal(cells.length, FLAGS_HEADER.length)
        assert.deepEqual(cells.slice(0, 7), Array(7).fill(''))
        assert.equal(cells[7], 'דוגמה')
        assert.equal(cells[8], 'TRUE')
        assert.equal(cells[9], 'FALSE')
    })

    it('is accepted by the parser and skips the non-numeric sample row', () => {
        const result = parseFlagsCsv(buildFlagsTemplate())

        assert.deepEqual(result.flags, [])
        assert.deepEqual(result.skipped, [{ code: 'דוגמה', row: 2 }])
    })
})
