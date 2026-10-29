import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    DEFAULT_REFUND_REASONS,
    parseRefundReasons,
    parseSettingBoolean,
} from '../../common/constants/refundReasons.js'

describe('refund reason settings', () => {
    it('parses one reason per line and drops blanks/duplicates', () => {
        assert.deepEqual(
            parseRefundReasons('טעות\n\nמוצר פגום\r\nטעות\n'),
            ['טעות', 'מוצר פגום']
        )
    })

    it('accepts an array value', () => {
        assert.deepEqual(parseRefundReasons(['א', 'ב']), ['א', 'ב'])
    })

    it('has a built-in default list', () => {
        assert.ok(DEFAULT_REFUND_REASONS.length > 0)
    })

    it('parses boolean settings written as strings or booleans', () => {
        assert.equal(parseSettingBoolean('true', false), true)
        assert.equal(parseSettingBoolean(false, true), false)
        assert.equal(parseSettingBoolean('0', true), false)
        assert.equal(parseSettingBoolean(undefined, true), true)
    })
})
