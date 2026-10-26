import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    DEFAULT_SALES_WINDOW_DAYS,
    MAX_SALES_WINDOW_DAYS,
    parseDays,
    normalizeSalesWindow,
    buildDepartmentWindows,
    daysForDepartment,
    isWithinWindow,
    buildKeptBarcodes,
    validateSalesWindowInput,
    resolveSalesWindow
} from '../../server/api/comax_product/salesWindow.js'

const NOW = new Date(2026, 9, 25, 12, 0, 0)
const daysAgo = days => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

function setting(value) {
    return {
        Setting: {
            readOne: async () => (value === undefined ? null : { value })
        }
    }
}

describe('comax sales window config', () => {
    it('defaults to 30 days when nothing is configured', () => {
        assert.equal(DEFAULT_SALES_WINDOW_DAYS, 30)
        assert.deepEqual(normalizeSalesWindow(undefined), { defaultDays: 30, rules: [] })
        assert.deepEqual(normalizeSalesWindow(null), { defaultDays: 30, rules: [] })
    })

    it('accepts 0 as a real value', () => {
        assert.equal(parseDays(0), 0)
        assert.equal(parseDays('0'), 0)
        assert.deepEqual(
            normalizeSalesWindow({ defaultDays: 0, rules: [{ days: 0, departments: ['13'] }] }),
            { defaultDays: 0, rules: [{ days: 0, departments: ['13'] }] }
        )
    })

    it('rejects days that are not integers inside 0..365', () => {
        for (const value of ['', 'abc', '1.5', -1, MAX_SALES_WINDOW_DAYS + 1, null, undefined])
            assert.equal(parseDays(value, 7), 7, String(value))
    })

    it('drops bad rules instead of failing the import', () => {
        const config = normalizeSalesWindow({
            defaultDays: 'not a number',
            rules: [
                { days: 7, departments: ['13', '13', '54'] },
                { days: -1, departments: ['9'] },
                { days: 5, departments: [] },
                { days: 5, departments: ['d:9', '  '] },
                { days: 10, departments: ['13'] },
                'garbage'
            ]
        })

        assert.deepEqual(config, {
            defaultDays: DEFAULT_SALES_WINDOW_DAYS,
            rules: [{ days: 7, departments: ['13', '54'] }]
        })
    })

    it('keeps the first rule that mentions a department', () => {
        const config = normalizeSalesWindow({
            rules: [
                { days: 7, departments: ['13'] },
                { days: 30, departments: ['13', '54'] }
            ]
        })

        assert.deepEqual(config.rules, [
            { days: 7, departments: ['13'] },
            { days: 30, departments: ['54'] }
        ])
    })

    it('uses the widest positive window as the single Comax query', () => {
        const windows = buildDepartmentWindows({
            defaultDays: 30,
            rules: [{ days: 90, departments: ['54'] }, { days: 0, departments: ['13'] }]
        })

        assert.equal(windows.defaultDays, 30)
        assert.equal(windows.maxDays, 90)
        assert.equal(windows.byDepartment.get('54'), 90)
        assert.equal(windows.byDepartment.get('13'), 0)
    })

    it('resolves a department window, falling back to the default', () => {
        const windows = buildDepartmentWindows({
            defaultDays: 30,
            rules: [{ days: 90, departments: ['54'] }]
        })

        assert.equal(daysForDepartment(windows, '54'), 90)
        assert.equal(daysForDepartment(windows, '13'), 30)
        assert.equal(daysForDepartment(windows, null), 30)
        assert.equal(daysForDepartment(windows, '999'), 30)
    })

    it('never filters when the window is 0 or the date is unusable', () => {
        assert.equal(isWithinWindow(daysAgo(400), 0, NOW), true)
        assert.equal(isWithinWindow(null, 30, NOW), true)
        assert.equal(isWithinWindow(new Date('nope'), 30, NOW), true)
        assert.equal(isWithinWindow(daysAgo(29), 30, NOW), true)
        assert.equal(isWithinWindow(daysAgo(31), 30, NOW), false)
    })
})

describe('comax sales window decisions', () => {
    const windows = buildDepartmentWindows({
        defaultDays: 30,
        rules: [{ days: 90, departments: ['54'] }]
    })

    it('keeps only the barcodes sold inside their department window', () => {
        const { kept, unknownDates } = buildKeptBarcodes([
            { barcode: 'a', departmentCode: '13', lastSaleDate: daysAgo(10) },
            { barcode: 'b', departmentCode: '13', lastSaleDate: daysAgo(40) },
            { barcode: 'c', departmentCode: '54', lastSaleDate: daysAgo(40) },
            { barcode: 'd', departmentCode: '54', lastSaleDate: daysAgo(100) },
            { barcode: 'e', departmentCode: '13', lastSaleDate: null }
        ], windows, NOW)

        assert.deepEqual([...kept].sort(), ['a', 'c', 'e'])
        assert.equal(unknownDates, 1)
    })

    it('records the newest sale per barcode', () => {
        const { lastSale } = buildKeptBarcodes([
            { barcode: 'a', departmentCode: '13', lastSaleDate: daysAgo(40) },
            { barcode: 'a', departmentCode: '13', lastSaleDate: daysAgo(5) }
        ], windows, NOW)

        assert.equal(lastSale.get('a').getTime(), daysAgo(5).getTime())
    })

    it('ignores rows without a barcode', () => {
        const { kept } = buildKeptBarcodes([
            { barcode: '', departmentCode: '13', lastSaleDate: daysAgo(1) },
            null
        ], windows, NOW)

        assert.equal(kept.size, 0)
    })
})

describe('comax sales window validation', () => {
    const known = ['13', '54']

    it('normalises numbers and strings', () => {
        assert.deepEqual(validateSalesWindowInput({}, known), { defaultDays: 30, rules: [] })
        assert.deepEqual(
            validateSalesWindowInput({
                defaultDays: '14',
                rules: [{ days: '0', departments: ['13', '54'] }]
            }, known),
            { defaultDays: 14, rules: [{ days: 0, departments: ['13', '54'] }] }
        )
    })

    it('rejects out-of-range days', () => {
        for (const days of [-1, MAX_SALES_WINDOW_DAYS + 1, 1.5, 'x']) {
            assert.throws(
                () => validateSalesWindowInput({ defaultDays: days }, known),
                err => err.status === 400,
                String(days)
            )
        }
    })

    it('rejects a rule without departments', () => {
        assert.throws(
            () => validateSalesWindowInput({ rules: [{ days: 7, departments: [] }] }, known),
            err => err.status === 400
        )
    })

    it('rejects a department configured twice', () => {
        assert.throws(
            () => validateSalesWindowInput({
                rules: [
                    { days: 7, departments: ['13'] },
                    { days: 30, departments: ['13'] }
                ]
            }, known),
            err => /twice/.test(err.message)
        )
    })

    it('rejects unknown departments and non-numeric codes', () => {
        assert.throws(
            () => validateSalesWindowInput({ rules: [{ days: 7, departments: ['999'] }] }, known),
            err => /unknown department/.test(err.message)
        )
        assert.throws(
            () => validateSalesWindowInput({ rules: [{ days: 7, departments: ['d:13'] }] }, known),
            err => /invalid department code/.test(err.message)
        )
    })

    it('rejects rules that are not an array', () => {
        assert.throws(
            () => validateSalesWindowInput({ rules: 'nope' }, known),
            err => err.status === 400
        )
    })
})

describe('comax sales window resolution', () => {
    it('enables the window from the stored config', async () => {
        const resolved = await resolveSalesWindow(setting({
            defaultDays: 30,
            rules: [{ days: 90, departments: ['54'] }]
        }))

        assert.equal(resolved.enabled, true)
        assert.equal(resolved.defaultDays, 30)
    })

    it('applies the 30 day default when the setting is absent', async () => {
        const resolved = await resolveSalesWindow(setting(undefined))

        assert.equal(resolved.enabled, true)
        assert.equal(resolved.defaultDays, 30)
    })

    it('disables the window when every value is 0', async () => {
        const resolved = await resolveSalesWindow(setting({ defaultDays: 0, rules: [] }))

        assert.equal(resolved.enabled, false)
    })

    it('disables the window instead of pruning when the setting cannot be read', async () => {
        const resolved = await resolveSalesWindow({
            Setting: { readOne: async () => { throw new Error('mongo is down') } }
        })

        assert.equal(resolved.enabled, false)
        assert.equal(resolved.defaultDays, 0)
        assert.deepEqual(resolved.rules, [])
    })
})
