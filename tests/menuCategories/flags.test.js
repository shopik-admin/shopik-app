import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyCategoryFlagStatuses } from '../../server/services/categoryMap/flagStatus.js'

describe('category flag status sweep', () => {
    const products = [
        { barcode: '1', status: 'active', comaxSubGroupCode: 'A' },
        { barcode: '2', status: 'active', comaxSubGroupCode: 'B', kashrut: { rabbinates: [{ code: '67011' }] } },
        { barcode: '3', status: 'active', comaxSubGroupCode: 'B', kashrut: { rabbinates: [{ code: '67085' }] } },
        { barcode: '4', status: 'active', comaxSubGroupCode: 'C' },
        { barcode: '5', status: 'active', comaxSubGroupCode: 'D' }
    ]
    const flags = [
        { subGroupCode: 'A', hidden: true, requireKashrut: false },
        { subGroupCode: 'B', hidden: false, requireKashrut: true },
        { subGroupCode: 'C', hidden: false, requireKashrut: false },
        { subGroupCode: 'D', hidden: true, requireKashrut: true }
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

        assert.deepEqual(summary.reasons, { categoryActive: 0, kashrut: 1, hidden: 1, both: 1 })
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
    const flags = (subGroupCode, hidden, requireKashrut) =>
        [{ subGroupCode, hidden, requireKashrut }]

    function makeDL({ products, rows, map }) {
        const written = []
        const findFilters = []

        const DL = {
            CategoryMap: { read: async () => map },
            ComaxProduct: {
                // Any row with a buying price makes the sync enforce one, same as
                // the nightly sync computes it.
                count: async () => rows.filter(row => row.buyingPrice > 0).length,
                Model: {
                    exists: async () => (rows.some(row => row.buyingPrice > 0) ? { _id: 'any' } : null)
                },
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
            map: flags('A', false, false)
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
            map: flags('A', false, false)
        })

        await applyCategoryFlagStatuses({ DL, relaxCodes: ['A'] })

        assert.deepEqual(written[0].storeIds, ['s2', 's3'])
    })

    it('only re-derives the sub-groups that relaxed', async () => {
        const { DL, written } = makeDL({
            products: [hiddenProduct('1', 'A'), hiddenProduct('2', 'B')],
            rows: [comaxRow('1'), comaxRow('2')],
            map: [
                { subGroupCode: 'A', hidden: false, requireKashrut: false },
                { subGroupCode: 'B', hidden: true, requireKashrut: false }
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
            map: flags('A', false, false)
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
            map: flags('A', false, false)
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
            map: flags('A', false, false)
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
            map: flags('A', false, false)
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
            map: flags('A', false, false)
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
            map: flags('A', false, true)
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
                { subGroupCode: 'A', hidden: false, requireKashrut: false },
                { subGroupCode: 'B', hidden: true, requireKashrut: false }
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
            map: flags('A', false, false)
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
            map: flags('A', false, false)
        })

        const summary = await applyCategoryFlagStatuses({ DL, limit: 1, relaxCodes: ['A'] })

        assert.equal(summary.unhideAllowed, 2)
        assert.equal(summary.unhidden, 1)
        assert.equal(summary.toWrite, 1)
        assert.equal(written.length, 1)
    })
})
