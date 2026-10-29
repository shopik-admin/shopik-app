import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import catalog from '../../server/reports/catalog.js'

const STORES = [
    { id: 'store-bat-yam', name: 'נטו בת ים' },
    { id: 'store-beitar', name: 'נטו ביתר עלית' }
]

function fakeDL({ comax = [], products = [], gs1 = [] }) {
    const list = docs => ({ sort: () => ({ lean: async () => docs }), lean: async () => docs })
    return {
        Domain: { readOne: async () => ({ id: 'default-domain' }) },
        Store: { Model: { find: () => list(STORES) } },
        ComaxProduct: { Model: { find: () => list(comax) } },
        Product: { Model: { find: () => list(products) } },
        Gs1Product: { Model: { distinct: async () => gs1 } }
    }
}

const comaxRow = (overrides = {}) => ({
    barcode: '7290000000015',
    name: 'שם קומקס',
    supplier: 'ספק קומקס',
    price: 9.9,
    buyingPrice: 6.5,
    vat: true,
    superDepartment: 'מזון',
    department: 'שימורים',
    group: 'שימורים',
    subGroup: 'שימורים',
    storeIds: ['store-bat-yam'],
    picUrl: null,
    ...overrides
})

const productRow = (overrides = {}) => ({
    barcode: '7290000000015',
    name: 'שם אתר',
    prices: [{ domainId: 'default-domain', price: 12.9 }],
    kashrut: { rabbinates: [{ code: '67085' }], supervisionType: 182 },
    images: { product: [{ main: true }] },
    ...overrides
})

// Column order is part of the report contract: [0..12] fixed, then one column
// per active store in the same order the stores were read.
const row = values => ({
    superDepartment: values[0], department: values[1], group: values[2], subGroup: values[3],
    barcode: values[4], name: values[5], supplier: values[6], kashrut: values[7], vat: values[8],
    inGs1: values[9], buyingPrice: values[10], salePrice: values[11], hasImage: values[12],
    stores: values.slice(13)
})

describe('catalog report', () => {
    it('adds one availability column per active store', async () => {
        const { columns } = await catalog.build(fakeDL({ comax: [comaxRow()] }))

        assert.equal(columns.length, 15)
        assert.deepEqual(columns.slice(13).map(column => column.text), [
            'האם בסניף נטו בת ים',
            'האם בסניף נטו ביתר עלית'
        ])
    })

    it('prefers the Product name and default-domain price, falling back to Comax', async () => {
        const { rows } = await catalog.build(fakeDL({
            comax: [comaxRow()],
            products: [productRow({ prices: [] })]
        }))

        assert.equal(rows[0][5], 'שם אתר')
        assert.equal(rows[0][11], 9.9)
        assert.equal(rows[0][6], 'ספק קומקס')
        assert.equal(rows[0][10], 6.5)

        const { rows: priced } = await catalog.build(fakeDL({
            comax: [comaxRow()],
            products: [productRow()]
        }))
        assert.equal(priced[0][11], 12.9)
    })

    it('joins on the barcode with leading zeros stripped', async () => {
        const { rows } = await catalog.build(fakeDL({
            comax: [comaxRow({ barcode: '0007290000000015' })],
            products: [productRow()]
        }))

        assert.equal(rows[0][4], '0007290000000015')
        assert.equal(rows[0][5], 'שם אתר')
        assert.equal(rows[0][12], 'כן')
    })

    it('renders kashrut, VAT, GS1 and image flags', async () => {
        const { rows } = await catalog.build(fakeDL({
            comax: [comaxRow()],
            products: [productRow()],
            gs1: ['7290000000015']
        }))
        const reportRow = row(rows[0])

        assert.equal(reportRow.kashrut, 'בד"ץ העדה החרדית ירושלים (חלבי)')
        assert.equal(reportRow.vat, 'true')
        assert.equal(reportRow.inGs1, 'כן')
        assert.equal(reportRow.hasImage, 'כן')
    })

    it('marks the stores the product is in stock in', async () => {
        const { rows } = await catalog.build(fakeDL({
            comax: [comaxRow({ storeIds: ['store-beitar'] })]
        }))

        assert.deepEqual(rows[0].slice(13), ['לא', 'כן'])
    })

    it('sorts by category and puts rows with no category last', async () => {
        const { rows } = await catalog.build(fakeDL({
            comax: [
                comaxRow({ barcode: '1', superDepartment: '', department: '' }),
                comaxRow({ barcode: '2', superDepartment: 'מזון', department: 'שימורים' }),
                comaxRow({ barcode: '3', superDepartment: 'מזון', department: 'ירקות' })
            ]
        }))

        // Plain codepoint order (ירקות < שימורים), which is what the previous
        // report produced; only the empty categories are forced to the end.
        assert.deepEqual(rows.map(values => values[4]), ['3', '2', '1'])
    })

    it('leaves the supplier empty when Comax has none', async () => {
        const { rows } = await catalog.build(fakeDL({ comax: [comaxRow({ supplier: null })] }))
        assert.equal(rows[0][6], '')
    })
})
