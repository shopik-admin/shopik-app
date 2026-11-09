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

    it('reports the codes whose flags became permissive, the ones that can bring products back', async () => {
        const mapRows = [
            { subGroupCode: '10100', showOnSite: false, requireKashrut: true },
            { subGroupCode: '10101', showOnSite: false, requireKashrut: false },
            { subGroupCode: '10102', showOnSite: true, requireKashrut: true },
            { subGroupCode: '10103', showOnSite: true, requireKashrut: false },
            { subGroupCode: '10104' }
        ]
        const written = []
        const summary = await importCategoryFlags({
            DL: {
                CategoryMap: {
                    read: async () => mapRows,
                    bulkWrite: async ({ docs }) => { written.push(...docs) }
                }
            },
            csvText: csv(
                row('10100', 'TRUE', 'FALSE'),
                row('10101', 'TRUE', 'TRUE'),
                row('10102', 'FALSE', 'FALSE'),
                row('10103', 'TRUE', 'FALSE'),
                row('10104', 'FALSE', 'TRUE')
            )
        })

        // 10100 both flags relaxed, 10101 show turned on, 10102 the kashrut rule
        // dropped. 10103 was already identical, 10104 had no stored flags (the
        // permissive default) and got stricter.
        assert.deepEqual(summary.relaxed, ['10100', '10101', '10102'])
        assert.equal(summary.unchanged, 1)
        assert.equal(written.length, 4)
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
        assert.equal(summary.hidden, 3)
        assert.equal(summary.unhidden, 0)
        assert.equal(summary.unhideCandidates, 0)
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

describe('category flag status sweep: the un-hide direction', () => {
    const STATUS = { ACTIVE: 'active', HIDDEN: 'hidden', ARCHIVED: 'archived' }
    const IMAGE = [{ main: true }]

    // A Comax row that passes every step of the status ladder.
    const comaxRow = (barcode, over = {}) => ({
        barcode,
        active: true,
        isTrailingItem: false,
        archived: false,
        price: 10,
        priceWithTrailing: 10,
        buyingPrice: 5,
        showInWeb: true,
        storeIds: ['s1'],
        ...over
    })
    const flags = (subGroupCode, showOnSite, requireKashrut) =>
        [{ subGroupCode, showOnSite, requireKashrut }]

    function makeDL({ products, rows, map }) {
        const written = []
        const findFilters = []

        const DL = {
            CategoryMap: { read: async () => map },
            ComaxProduct: {
                // Any row with a buying price makes the sync enforce one, same as
                // the nightly sync computes it.
                count: async () => rows.filter(row => row.buyingPrice > 0).length,
                read: async filter => rows.filter(row => filter.barcode.$in.includes(row.barcode))
            },
            Product: {
                constants: { STATUS },
                Model: {
                    find: filter => {
                        findFilters.push(filter)
                        return {
                            lean: async () => products.filter(product =>
                                product.status === filter.status &&
                                (!filter.comaxSubGroupCode ||
                                    filter.comaxSubGroupCode.$in.includes(product.comaxSubGroupCode)))
                        }
                    }
                },
                bulkWrite: async ({ docs }) => { written.push(...docs) }
            }
        }

        return { DL, written, findFilters }
    }

    const hiddenProduct = (barcode, comaxSubGroupCode, over = {}) => ({
        barcode,
        status: 'hidden',
        comaxSubGroupCode,
        images: { product: IMAGE },
        ...over
    })

    it('brings back a hidden product of a relaxed sub-group when the ladder allows it', async () => {
        const { DL, written, findFilters } = makeDL({
            products: [hiddenProduct('1', 'A')],
            rows: [comaxRow('1')],
            map: flags('A', true, false)
        })

        const summary = await applyCategoryFlagStatuses({ DL, relaxCodes: ['A'] })

        assert.deepEqual(written, [{
            barcode: '1',
            previousStatus: 'hidden',
            status: 'active',
            storeIds: ['s1']
        }])
        assert.equal(summary.hidden, 0)
        assert.equal(summary.unhidden, 1)
        assert.equal(summary.unhideCandidates, 1)
        assert.equal(summary.toWrite, 1)
        // The candidate query is narrowed to the codes that just relaxed.
        assert.deepEqual(findFilters[1], { status: 'hidden', comaxSubGroupCode: { $in: ['A'] } })
    })

    it('writes the stores of the Comax row so the storeless backstop does not hide it again', async () => {
        const { DL, written } = makeDL({
            products: [hiddenProduct('1', 'A')],
            rows: [comaxRow('1', { storeIds: ['s2', 's3'] })],
            map: flags('A', true, false)
        })

        await applyCategoryFlagStatuses({ DL, relaxCodes: ['A'] })

        assert.deepEqual(written[0].storeIds, ['s2', 's3'])
    })

    it('only re-derives the sub-groups that relaxed', async () => {
        const { DL, written } = makeDL({
            products: [hiddenProduct('1', 'A'), hiddenProduct('2', 'B')],
            rows: [comaxRow('1'), comaxRow('2')],
            map: [
                { subGroupCode: 'A', showOnSite: true, requireKashrut: false },
                { subGroupCode: 'B', showOnSite: false, requireKashrut: false }
            ]
        })

        const summary = await applyCategoryFlagStatuses({ DL, relaxCodes: ['A'] })

        assert.equal(summary.unhidden, 1)
        assert.deepEqual(written.map(doc => doc.barcode), ['1'])
    })

    it("reconciles every hidden product when relaxCodes is 'all'", async () => {
        const { DL, written, findFilters } = makeDL({
            products: [hiddenProduct('1', 'A'), hiddenProduct('2', 'B')],
            rows: [comaxRow('1'), comaxRow('2')],
            map: flags('A', true, false)
        })

        const summary = await applyCategoryFlagStatuses({ DL, relaxCodes: 'all' })

        assert.equal(summary.unhidden, 2)
        assert.equal(written.length, 2)
        assert.deepEqual(findFilters[1], { status: 'hidden' })
    })

    it('leaves a hidden product with no Comax row to the nightly sync', async () => {
        const { DL, written } = makeDL({
            products: [hiddenProduct('1', 'A')],
            rows: [],
            map: flags('A', true, false)
        })

        const summary = await applyCategoryFlagStatuses({ DL, relaxCodes: ['A'] })

        assert.equal(summary.unhidden, 0)
        assert.deepEqual(summary.unhideSkipped, { noComax: 1, outOfScope: 0, ladder: 0 })
        assert.deepEqual(written, [])
    })

    it('leaves products the sync loop never visits hidden', async () => {
        const { DL, written } = makeDL({
            products: [hiddenProduct('1', 'A'), hiddenProduct('2', 'A')],
            rows: [comaxRow('1', { active: false }), comaxRow('2', { isTrailingItem: true })],
            map: flags('A', true, false)
        })

        const summary = await applyCategoryFlagStatuses({ DL, relaxCodes: ['A'] })

        assert.equal(summary.unhidden, 0)
        assert.deepEqual(summary.unhideSkipped, { noComax: 0, outOfScope: 2, ladder: 0 })
        assert.deepEqual(written, [])
    })

    it('keeps hidden everything the status ladder still hides', async () => {
        const { DL, written } = makeDL({
            products: [
                hiddenProduct('1', 'A', { images: { product: [] } }),
                hiddenProduct('2', 'A'),
                hiddenProduct('3', 'A'),
                hiddenProduct('4', 'A'),
                hiddenProduct('5', 'A')
            ],
            rows: [
                comaxRow('1'),
                comaxRow('2', { showInWeb: false }),
                comaxRow('3', { storeIds: [] }),
                comaxRow('4', { archived: true }),
                comaxRow('5', { price: 0, priceWithTrailing: 0 })
            ],
            map: flags('A', true, false)
        })

        const summary = await applyCategoryFlagStatuses({ DL, relaxCodes: ['A'] })

        assert.equal(summary.unhidden, 0)
        assert.deepEqual(summary.unhideSkipped, { noComax: 0, outOfScope: 0, ladder: 5 })
        assert.deepEqual(written, [])
    })

    it('honours the buying-price rule the sync derives statuses with', async () => {
        const { DL, written } = makeDL({
            products: [hiddenProduct('1', 'A'), hiddenProduct('2', 'A')],
            rows: [comaxRow('1', { buyingPrice: 0 }), comaxRow('2')],
            map: flags('A', true, false)
        })

        const summary = await applyCategoryFlagStatuses({ DL, relaxCodes: ['A'] })

        assert.equal(summary.unhidden, 1)
        assert.deepEqual(written.map(doc => doc.barcode), ['2'])
    })

    it('un-hides a kashrut-required sub-group only for products with a valid code', async () => {
        const { DL, written } = makeDL({
            products: [
                hiddenProduct('1', 'A', { kashrut: { rabbinates: [{ code: '67085' }] } }),
                hiddenProduct('2', 'A', { kashrut: { rabbinates: [{ code: '67011' }] } })
            ],
            rows: [comaxRow('1'), comaxRow('2')],
            map: flags('A', true, true)
        })

        const summary = await applyCategoryFlagStatuses({ DL, relaxCodes: ['A'] })

        assert.equal(summary.unhidden, 1)
        assert.deepEqual(written.map(doc => doc.barcode), ['1'])
    })

    it('hides and un-hides in the same pass, hides first', async () => {
        const { DL, written } = makeDL({
            products: [
                { barcode: '9', status: 'active', comaxSubGroupCode: 'B' },
                hiddenProduct('1', 'A')
            ],
            rows: [comaxRow('1')],
            map: [
                { subGroupCode: 'A', showOnSite: true, requireKashrut: false },
                { subGroupCode: 'B', showOnSite: false, requireKashrut: false }
            ]
        })

        const summary = await applyCategoryFlagStatuses({ DL, relaxCodes: ['A'] })

        assert.equal(summary.hidden, 1)
        assert.equal(summary.unhidden, 1)
        assert.deepEqual(written.map(doc => [doc.barcode, doc.status]), [['9', 'hidden'], ['1', 'active']])
    })

    it('reports the impact on a dry run without writing', async () => {
        const { DL, written } = makeDL({
            products: [hiddenProduct('1', 'A')],
            rows: [comaxRow('1')],
            map: flags('A', true, false)
        })

        const summary = await applyCategoryFlagStatuses({ DL, dryRun: true, relaxCodes: ['A'] })

        assert.equal(summary.unhidden, 1)
        assert.equal(summary.toWrite, 1)
        assert.deepEqual(written, [])
    })

    it('caps the writes it makes on a limited run but still reports the impact', async () => {
        const { DL, written } = makeDL({
            products: [hiddenProduct('1', 'A'), hiddenProduct('2', 'A')],
            rows: [comaxRow('1'), comaxRow('2')],
            map: flags('A', true, false)
        })

        const summary = await applyCategoryFlagStatuses({ DL, limit: 1, relaxCodes: ['A'] })

        assert.equal(summary.unhideAllowed, 2)
        assert.equal(summary.unhidden, 1)
        assert.equal(summary.toWrite, 1)
        assert.equal(written.length, 1)
    })
})
