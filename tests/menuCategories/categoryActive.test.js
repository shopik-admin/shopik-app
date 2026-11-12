import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { deriveStatus } from '#server/api/comax_product/status.js'
import { descendantIds, mirrorCategoryActive } from '#server/services/categoryMap/categoryActive.js'
import updateCategory from '#server/api/category/update.js'

describe('category active cascade', () => {
    it('collects the whole subtree from parentIds', () => {
        const categories = [
            { id: 'a', parentIds: [] },
            { id: 'b', parentIds: ['a'] },
            { id: 'c', parentIds: ['a', 'b'] },
            { id: 'd', parentIds: [] }
        ]

        assert.deepEqual(descendantIds(categories, 'a'), ['a', 'b', 'c'])
        assert.deepEqual(descendantIds(categories, 'b'), ['b', 'c'])
        assert.deepEqual(descendantIds(categories, 'd'), ['d'])
    })

    it('hides a product whose category is inactive, independently of showOnSite', () => {
        const status = { ACTIVE: 'active', HIDDEN: 'hidden', ARCHIVED: 'archived' }
        const comax = { price: 10, showInWeb: true, storeIds: ['s1'] }
        const existing = { images: { product: [{ main: true }] } }

        assert.equal(deriveStatus({
            comax,
            existing,
            flags: { categoryActive: false, showOnSite: true, requireKashrut: false },
            status
        }), status.HIDDEN)

        assert.equal(deriveStatus({
            comax,
            existing,
            flags: { categoryActive: true, showOnSite: true, requireKashrut: false },
            status
        }), status.ACTIVE)

        // Re-activating the category must not override Comax's own hide flag.
        assert.equal(deriveStatus({
            comax,
            existing,
            flags: { categoryActive: true, showOnSite: false, requireKashrut: false },
            status
        }), status.HIDDEN)
    })
})

describe('mirrorCategoryActive', () => {
    function fakeDL({ categories, rows }) {
        const written = []
        return {
            written,
            DL: {
                Category: {
                    read: async () => categories
                },
                CategoryMap: {
                    read: async () => rows,
                    bulkWrite: async ({ docs }) => { written.push(...docs) }
                }
            }
        }
    }

    it('writes only the rows whose mapped category changed state', async () => {
        const { DL, written } = fakeDL({
            categories: [
                { id: 'off', active: false },
                { id: 'on', active: true }
            ],
            rows: [
                // Missing flag means active -> tightening.
                { subGroupCode: '100', categoryId: 'off' },
                // Stored false but the category is now active -> relaxing.
                { subGroupCode: '101', categoryId: 'on', categoryActive: false },
                // Unassigned stays active and is left alone.
                { subGroupCode: '102', categoryId: null, categoryActive: false },
                // Already correct -> no write.
                { subGroupCode: '103', categoryId: 'on', categoryActive: true }
            ]
        })

        const mirror = await mirrorCategoryActive({ DL })

        assert.deepEqual(written, [
            { subGroupCode: '100', categoryActive: false },
            { subGroupCode: '101', categoryActive: true },
            { subGroupCode: '102', categoryActive: true }
        ])
        assert.deepEqual(mirror.tightened, ['100'])
        assert.deepEqual(mirror.relaxed, ['101', '102'])
    })

    it('can be scoped to the branch that was toggled', async () => {
        const { DL, written } = fakeDL({
            categories: [
                { id: 'a', active: false },
                { id: 'b', active: false }
            ],
            rows: [
                { subGroupCode: '200', categoryId: 'a' },
                { subGroupCode: '201', categoryId: 'b' }
            ]
        })

        const mirror = await mirrorCategoryActive({ DL, categoryIds: ['a'] })

        assert.deepEqual(written, [{ subGroupCode: '200', categoryActive: false }])
        assert.deepEqual(mirror.tightened, ['200'])
    })

    it('reports changes without writing on a dry run', async () => {
        const { DL, written } = fakeDL({
            categories: [{ id: 'off', active: false }],
            rows: [{ subGroupCode: '300', categoryId: 'off' }]
        })

        const mirror = await mirrorCategoryActive({ DL, dryRun: true })

        assert.equal(mirror.changed, 1)
        assert.equal(mirror.written, 0)
        assert.deepEqual(written, [])
    })
})

describe('category/update active checkbox', () => {
    const STATUS = { ACTIVE: 'active', HIDDEN: 'hidden', ARCHIVED: 'archived' }

    function fakeDL() {
        const categories = [
            { id: 'p', parentId: null, parentIds: [], name: 'Parent', active: true },
            { id: 'c', parentId: 'p', parentIds: ['p'], name: 'Child', active: true }
        ]
        const rows = [
            { subGroupCode: '100', categoryId: 'c', showOnSite: true, requireKashrut: false }
        ]
        const products = [{
            barcode: '1',
            status: STATUS.ACTIVE,
            comaxSubGroupCode: '100',
            images: { product: [{ main: true }] }
        }]
        const comax = [{
            barcode: '1',
            active: true,
            isTrailingItem: false,
            archived: false,
            price: 10,
            showInWeb: true,
            storeIds: ['s1']
        }]

        const DL = {
            Category: {
                readById: async id => categories.find(category => category.id === id),
                read: async () => categories,
                update: async (filter, patch) => {
                    for (const category of categories) {
                        if (!filter.id.$in.includes(category.id)) continue
                        Object.assign(category, patch)
                    }
                    return { modifiedCount: filter.id.$in.length }
                }
            },
            CategoryMap: {
                read: async () => rows,
                bulkWrite: async ({ docs }) => {
                    for (const doc of docs) {
                        const row = rows.find(item => item.subGroupCode === doc.subGroupCode)
                        if (row) Object.assign(row, doc)
                    }
                }
            },
            Product: {
                constants: { STATUS },
                Model: {
                    find: filter => ({
                        lean: async () => products.filter(product =>
                            product.status === filter.status &&
                            (!filter.comaxSubGroupCode ||
                                filter.comaxSubGroupCode.$in.includes(product.comaxSubGroupCode)))
                    })
                },
                bulkWrite: async ({ docs }) => {
                    for (const doc of docs) {
                        const product = products.find(item => item.barcode === doc.barcode)
                        if (product) Object.assign(product, doc)
                    }
                }
            },
            ComaxProduct: {
                count: async () => 0,
                read: async () => comax
            }
        }

        return { DL, categories, rows, products }
    }

    it('cascades to descendants, mirrors the flag and hides the products', async () => {
        const { DL, categories, rows, products } = fakeDL()

        await updateCategory({ id: 'p', active: false }, { DL })

        assert.equal(categories.find(category => category.id === 'p').active, false)
        assert.equal(categories.find(category => category.id === 'c').active, false)
        assert.equal(rows[0].categoryActive, false)
        assert.equal(products[0].status, STATUS.HIDDEN)
    })

    it('brings the branch and its products back without touching showOnSite', async () => {
        const { DL, categories, rows, products } = fakeDL()
        await updateCategory({ id: 'p', active: false }, { DL })

        await updateCategory({ id: 'p', active: true }, { DL })

        assert.equal(categories.find(category => category.id === 'p').active, true)
        assert.equal(categories.find(category => category.id === 'c').active, true)
        assert.equal(rows[0].categoryActive, true)
        assert.equal(rows[0].showOnSite, true)
        assert.equal(products[0].status, STATUS.ACTIVE)
    })

    it('leaves a permanently hidden sub-group hidden after reactivation', async () => {
        const { DL, categories, rows, products } = fakeDL()
        rows[0].showOnSite = false

        await updateCategory({ id: 'p', active: false }, { DL })
        await updateCategory({ id: 'p', active: true }, { DL })

        assert.equal(categories.find(category => category.id === 'c').active, true)
        assert.equal(rows[0].categoryActive, true)
        assert.equal(rows[0].showOnSite, false)
        assert.equal(products[0].status, STATUS.HIDDEN)
    })
})
