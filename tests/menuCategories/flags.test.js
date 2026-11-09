import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { importCategoryFlags, parseFlagsCsv } from '../../server/services/categoryMap/flags.js'
import { applyCategoryFlagStatuses } from '../../server/services/categoryMap/flagStatus.js'

const HEADER = 'שם מחלקת על,מחלקת על,שם מחלקה,מחלקה,שם קבוצה,קבוצה,שם,קוד,הצגת קטגוריה,חובה כשרות'
const row = (code, show, kashrut, name = 'מוצר') =>
    `לחם,1,ביצים,101,ביצים מיוחדות,1010,${name},${code},${show},${kashrut}`
const csv = (...rows) => [HEADER, ...rows].join('\r\n')

describe('category flags CSV', () => {
    it('parses distinct sub-group flags', () => {
        const result = parseFlagsCsv(csv(
            row('10100', 'TRUE', 'FALSE'),
            row('10101', 'FALSE', 'TRUE')
        ))

        assert.deepEqual(result.flags, [
            { subGroupCode: '10100', showOnSite: true, requireKashrut: false },
            { subGroupCode: '10101', showOnSite: false, requireKashrut: true }
        ])
        assert.deepEqual(result.skipped, [])
    })

    it('dedupes repeated codes and handles quoted names with commas and line breaks', () => {
        const result = parseFlagsCsv(csv(
            row('10100', 'TRUE', 'FALSE', '"שם, עם פסיק"'),
            row('10100', 'TRUE', 'FALSE'),
            row('10101', 'TRUE', 'TRUE', '"שם\nעם שורה"')
        ))

        assert.equal(result.flags.length, 2)
        assert.deepEqual(result.flags[1], {
            subGroupCode: '10101',
            showOnSite: true,
            requireKashrut: true
        })
    })

    it('skips a repeated header row and other non-numeric codes', () => {
        const result = parseFlagsCsv(csv(
            row('10100', 'TRUE', 'FALSE'),
            HEADER
        ))

        assert.deepEqual(result.flags, [
            { subGroupCode: '10100', showOnSite: true, requireKashrut: false }
        ])
        assert.deepEqual(result.skipped, [{ code: 'קוד', row: 3 }])
    })

    const messageMatches = pattern => error => pattern.test(error?.message || '')

    it('rejects conflicting flags for the same code', () => {
        assert.throws(
            () => parseFlagsCsv(csv(
                row('10100', 'TRUE', 'FALSE'),
                row('10100', 'FALSE', 'TRUE')
            )),
            messageMatches(/conflicting flags for sub-group 10100/)
        )
    })

    it('rejects a value that is not TRUE/FALSE', () => {
        assert.throws(
            () => parseFlagsCsv(csv(row('10100', 'YES', 'FALSE'))),
            messageMatches(/invalid הצגת קטגוריה/)
        )
    })

    it('rejects a 14-column tree file', () => {
        const treeHeader = 'שם מחלקת על,מחלקת על,שם מחלקה,מחלקה,שם קבוצה,קבוצה,שם,קוד,רמה 1 באתר,קוד רמה 1,רמה 2 באתר,קוד רמה 2,רמה 3 באתר,קוד רמה 3'
        assert.throws(
            () => parseFlagsCsv([treeHeader, 'a,1,b,2,c,3,d,4,e,5,f,6,g,7'].join('\n')),
            messageMatches(/invalid flags CSV header/)
        )
    })
})

describe('category flags import', () => {
    const rows = [
        { subGroupCode: '10100', showOnSite: true, requireKashrut: false },
        { subGroupCode: '99999', showOnSite: true, requireKashrut: false }
    ]

    const makeDL = (written = []) => ({
        CategoryMap: {
            read: async () => rows,
            bulkWrite: async ({ docs }) => { written.push(...docs) }
        }
    })

    it('writes only the rows whose flags changed and reports the rest', async () => {
        const written = []
        const summary = await importCategoryFlags({
            DL: makeDL(written),
            csvText: csv(
                row('10100', 'FALSE', 'TRUE'),
                row('99999', 'TRUE', 'FALSE'),
                row('90511', 'TRUE', 'FALSE')
            )
        })

        assert.equal(summary.codes, 3)
        assert.equal(summary.written, 1)
        assert.equal(summary.unchanged, 1)
        assert.deepEqual(summary.unknown, ['90511'])
        assert.deepEqual(summary.untouched, [])
        assert.deepEqual(summary.previous, [{
            subGroupCode: '10100',
            showOnSite: true,
            requireKashrut: false
        }])
        assert.deepEqual(written, [{
            subGroupCode: '10100',
            showOnSite: false,
            requireKashrut: true,
            previous: { showOnSite: true, requireKashrut: false }
        }])
    })

    it('reports map codes the file does not mention and leaves them alone', async () => {
        const written = []
        const summary = await importCategoryFlags({
            DL: makeDL(written),
            csvText: csv(row('10100', 'FALSE', 'FALSE'))
        })

        assert.deepEqual(summary.untouched, ['99999'])
        assert.equal(written.length, 1)
    })

    it('writes nothing on a dry run', async () => {
        const written = []
        const summary = await importCategoryFlags({
            DL: makeDL(written),
            csvText: csv(row('10100', 'FALSE', 'TRUE')),
            dryRun: true
        })

        assert.equal(summary.pending, 1)
        assert.equal(summary.written, 0)
        assert.deepEqual(written, [])
    })
})

describe('category flag status sweep', () => {
    const products = [
        { barcode: '1', status: 'active', comaxSubGroupCode: 'A' },
        { barcode: '2', status: 'active', comaxSubGroupCode: 'B', kashrut: { rabbinates: [{ code: '67011' }] } },
        { barcode: '3', status: 'active', comaxSubGroupCode: 'B', kashrut: { rabbinates: [{ code: '67085' }] } },
        { barcode: '4', status: 'active', comaxSubGroupCode: 'C' },
        { barcode: '5', status: 'active', comaxSubGroupCode: 'D' }
    ]
    const flags = [
        { subGroupCode: 'A', showOnSite: false, requireKashrut: false },
        { subGroupCode: 'B', showOnSite: true, requireKashrut: true },
        { subGroupCode: 'C', showOnSite: true, requireKashrut: false },
        { subGroupCode: 'D', showOnSite: false, requireKashrut: true }
    ]

    const makeDL = (written = []) => ({
        CategoryMap: { read: async () => flags },
        Product: {
            constants: { STATUS: { ACTIVE: 'active', HIDDEN: 'hidden' } },
            Model: {
                find: filter => {
                    assert.deepEqual(filter, { status: 'active' })
                    return { lean: async () => products }
                }
            },
            bulkWrite: async ({ docs }) => { written.push(...docs) }
        }
    })

    it('hides only the affected active products and counts the reasons', async () => {
        const written = []
        const summary = await applyCategoryFlagStatuses({ DL: makeDL(written) })

        assert.deepEqual(summary.reasons, { category: 1, kashrut: 1, both: 1 })
        assert.equal(summary.toWrite, 3)
        assert.deepEqual(written.map(doc => doc.barcode), ['1', '2', '5'])
        assert.deepEqual(written.map(doc => doc.status), ['hidden', 'hidden', 'hidden'])
        assert.deepEqual(written.map(doc => doc.previousStatus), ['active', 'active', 'active'])
    })

    it('writes nothing on a dry run but still reports the impact', async () => {
        const written = []
        const summary = await applyCategoryFlagStatuses({ DL: makeDL(written), dryRun: true })

        assert.equal(summary.toWrite, 3)
        assert.deepEqual(written, [])
    })

    it('respects the limit', async () => {
        const written = []
        const summary = await applyCategoryFlagStatuses({ DL: makeDL(written), limit: 2 })

        assert.equal(summary.toWrite, 2)
        assert.equal(written.length, 2)
    })
})
