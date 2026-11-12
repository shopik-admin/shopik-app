import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import catalog from '../../server/reports/catalog.js'

const STORES = [
    { id: 'store-bat-yam', name: 'נטו בת ים' },
    { id: 'store-beitar', name: 'נטו ביתר עלית' }
]

function fakeDL({ comax = [], products = [], gs1 = [], categoryFlags = [] }) {
    const list = docs => ({ sort: () => ({ lean: async () => docs }), lean: async () => docs })
    return {
        Domain: { readOne: async () => ({ id: 'default-domain' }) },
        Store: { Model: { find: () => list(STORES) } },
        ComaxProduct: { Model: { find: () => list(comax) } },
        Product: { Model: { find: () => list(products) } },
        CategoryMap: { read: async () => categoryFlags },
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

// Column order is part of the report contract: [0..15] fixed, then one column
// per active store in the same order the stores were read.
const row = values => ({
    superDepartment: values[0], department: values[1], group: values[2], subGroup: values[3],
    categoryShown: values[4], categoryRequires: values[5], barcode: values[6], name: values[7],
    supplier: values[8], kashrut: values[9], kashrutValid: values[10], vat: values[11],
    inGs1: values[12], buyingPrice: values[13], salePrice: values[14], hasImage: values[15],
    stores: values.slice(16)
})

describe('catalog report', () => {
    it('adds one availability column per active store', async () => {
        const { columns } = await catalog.build(fakeDL({ comax: [comaxRow()] }))

        assert.equal(columns.length, 18)
        assert.deepEqual(columns.slice(4, 6).map(column => column.text), [
            'קטגוריה מוצגת באתר',
            'קטגוריה דורשת כשרות'
        ])
        assert.deepEqual(columns.slice(16).map(column => column.text), [
            'האם בסניף נטו בת ים',
            'האם בסניף נטו ביתר עלית'
        ])
    })

    it('prefers the Product name and default-domain price, falling back to Comax', async () => {
        const { rows } = await catalog.build(fakeDL({
            comax: [comaxRow()],
            products: [productRow({ prices: [] })]
        }))

        assert.equal(rows[0][7], 'שם אתר')
        assert.equal(rows[0][14], 9.9)
        assert.equal(rows[0][8], 'ספק קומקס')
        assert.equal(rows[0][13], 6.5)

        const { rows: priced } = await catalog.build(fakeDL({
            comax: [comaxRow()],
            products: [productRow()]
        }))
        assert.equal(priced[0][14], 12.9)
    })

    it('joins on the barcode with leading zeros stripped', async () => {
        const { rows } = await catalog.build(fakeDL({
            comax: [comaxRow({ barcode: '0007290000000015' })],
            products: [productRow()]
        }))

        assert.equal(rows[0][6], '0007290000000015')
        assert.equal(rows[0][7], 'שם אתר')
        assert.equal(rows[0][15], 'כן')
    })

    it('renders kashrut, VAT, GS1 and image flags', async () => {
        const { rows } = await catalog.build(fakeDL({
            comax: [comaxRow()],
            products: [productRow()],
            gs1: ['7290000000015']
        }))
        const reportRow = row(rows[0])

        assert.equal(reportRow.kashrut, 'בד"ץ העדה החרדית ירושלים (חלבי)')
        assert.equal(reportRow.kashrutValid, 'כן')
        assert.equal(reportRow.vat, 'true')
        assert.equal(reportRow.inGs1, 'כן')
        assert.equal(reportRow.hasImage, 'כן')
    })

    it('marks כשרות מתאימה only by valid codes, same rule as the status ladder', async () => {
        const build = kashrut => catalog.build(fakeDL({
            comax: [comaxRow()],
            products: [productRow({ kashrut })]
        }))

        const valid = (await build({ rabbinates: [{ code: '99999' }, { code: '67093', name: 'בדצ בית יוסף' }] })).rows[0]
        assert.equal(row(valid).kashrutValid, 'כן')

        const unknown = (await build({ rabbinates: [{ code: '99999' }] })).rows[0]
        assert.equal(row(unknown).kashrutValid, 'לא')

        const nameOnly = (await build({ rabbinates: [{ name: 'רבנות אחרת' }] })).rows[0]
        assert.equal(row(nameOnly).kashrutValid, 'לא')

        const none = (await build(undefined)).rows[0]
        assert.equal(row(none).kashrutValid, 'לא')
    })

    it('reads קטגוריה דורשת כשרות from the sub-group requireKashrut flag', async () => {
        const built = async categoryFlags => (await catalog.build(fakeDL({
            comax: [comaxRow({ subGroupCode: '90200' })],
            categoryFlags
        }))).rows[0][5]

        assert.equal(await built([{ subGroupCode: '90200', requireKashrut: true }]), 'כן')
        assert.equal(await built([{ subGroupCode: '90200', requireKashrut: false }]), 'לא')
        // A category_map row the flags file never set means no requirement,
        // like the status ladder treats it.
        assert.equal(await built([{ subGroupCode: '90200' }]), 'לא')
        // A sub-group with no category_map row is unknown, like a Comax row
        // without a sub-group code at all.
        assert.equal(await built([{ subGroupCode: '90201', requireKashrut: true }]), '')
        assert.equal(await built([]), '')
        assert.equal((await catalog.build(fakeDL({ comax: [comaxRow()] }))).rows[0][5], '')
    })

    it('reads קטגוריה מוצגת באתר from the sub-group showOnSite flag', async () => {
        const built = async categoryFlags => (await catalog.build(fakeDL({
            comax: [comaxRow({ subGroupCode: '90200' })],
            categoryFlags
        }))).rows[0][4]

        assert.equal(await built([{ subGroupCode: '90200', showOnSite: false }]), 'לא')
        assert.equal(await built([{ subGroupCode: '90200', showOnSite: true }]), 'כן')
        // A category_map row the flags file never set defaults to show, like
        // the status ladder treats it.
        assert.equal(await built([{ subGroupCode: '90200' }]), 'כן')
        // A sub-group with no category_map row is unknown, like a Comax row
        // without a sub-group code at all.
        assert.equal(await built([{ subGroupCode: '90201', showOnSite: false }]), '')
        assert.equal(await built([]), '')
        assert.equal((await catalog.build(fakeDL({ comax: [comaxRow()] }))).rows[0][4], '')
    })

    it('marks the stores the product is in stock in', async () => {
        const { rows } = await catalog.build(fakeDL({
            comax: [comaxRow({ storeIds: ['store-beitar'] })]
        }))

        assert.deepEqual(rows[0].slice(16), ['לא', 'כן'])
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
        assert.deepEqual(rows.map(values => values[6]), ['3', '2', '1'])
    })

    it('leaves the supplier empty when Comax has none', async () => {
        const { rows } = await catalog.build(fakeDL({ comax: [comaxRow({ supplier: null })] }))
        assert.equal(rows[0][8], '')
    })
})
