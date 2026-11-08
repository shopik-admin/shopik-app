import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import subGroupProducts from '#server/api/category/products.js'

const ACTIVE = 'active'

function fakeDL(products = []) {
    const reads = []

    const matching = filter => products.filter(product =>
        product.comaxSubGroupCode === filter.comaxSubGroupCode && product.status === filter.status)

    const DL = {
        Product: {
            constants: { STATUS: { ACTIVE, HIDDEN: 'hidden', ARCHIVED: 'archived' } },
            read: async (filter, select, options) => {
                reads.push({ filter, select, options })
                const docs = matching(filter)
                return options.limit ? docs.slice(0, options.limit) : docs
            },
            Model: { countDocuments: async filter => matching(filter).length }
        }
    }

    return { DL, reads }
}

const products = [
    { id: 'p1', name: 'תפוח חרמון', barcode: '7290000000001', comaxSubGroupCode: '1370', status: ACTIVE },
    { id: 'p2', name: 'בננה', barcode: '7290000000002', comaxSubGroupCode: '1370', status: ACTIVE },
    // Not part of the category: the storefront does not show them either.
    { id: 'p3', name: 'גזר', barcode: '7290000000003', comaxSubGroupCode: '1370', status: 'hidden' },
    { id: 'p4', name: 'תפוז', barcode: '7290000000004', comaxSubGroupCode: '1371', status: ACTIVE },
    { id: 'p5', name: 'תפוח', barcode: '7290000000005', comaxSubGroupCode: '1370', status: 'archived' }
]

describe('sub-group products preview', () => {
    it('returns only the active products of that sub-group', async () => {
        const { DL, reads } = fakeDL(products)
        const res = await subGroupProducts({ subGroupCode: '1370' }, { DL })

        assert.deepEqual(res.products.map(product => product.id), ['p1', 'p2'])
        assert.equal(res.total, 2)
        assert.equal(res.shown, 2)
        assert.equal(res.subGroupCode, '1370')
        assert.deepEqual(reads[0].filter, { comaxSubGroupCode: '1370', status: ACTIVE })
    })

    it('sends just id, name and barcode (the image is built from the id)', async () => {
        const { DL, reads } = fakeDL(products)
        await subGroupProducts({ subGroupCode: '1370' }, { DL })

        assert.deepEqual(reads[0].select, { _id: 0, id: 1, name: 1, barcode: 1 })
    })

    it('reports an empty preview instead of failing', async () => {
        const { DL } = fakeDL(products)
        const res = await subGroupProducts({ subGroupCode: '99999' }, { DL })

        assert.deepEqual(res, { subGroupCode: '99999', total: 0, shown: 0, products: [] })
    })

    it('caps how many products a preview page carries', async () => {
        const wide = Array.from({ length: 300 }, (_, index) =>
            ({ id: `p${index}`, name: `מוצר ${index}`, comaxSubGroupCode: '1370', status: ACTIVE }))

        for (const [limit, expected] of [[undefined, 60], [10, 10], [1000, 200], ['abc', 60], [0, 60]]) {
            const { DL, reads } = fakeDL(wide)
            const res = await subGroupProducts({ subGroupCode: '1370', limit }, { DL })

            assert.equal(reads[0].options.limit, expected, `limit ${JSON.stringify(limit)}`)
            assert.equal(res.shown, expected)
            assert.equal(res.total, 300, 'the count stays the real one')
        }
    })

    it('requires the sub-group code', async () => {
        const { DL } = fakeDL(products)

        for (const payload of [{}, { subGroupCode: '  ' }, { subGroupCode: null }])
            await assert.rejects(() => subGroupProducts(payload, { DL }), { status: 400, message: 'subGroupCode required' })
    })

    it('is readable by anyone who can read the categories', () => {
        assert.deepEqual(subGroupProducts.config, {
            required: ['subGroupCode'],
            permissions: ['category:read']
        })
    })
})
