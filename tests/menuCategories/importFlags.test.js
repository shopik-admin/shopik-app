import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import importCategoryFlags from '#server/api/category/import_flags.js'

const HEADER = 'שם מחלקת על,מחלקת על,שם מחלקה,מחלקה,שם קבוצה,קבוצה,שם,קוד,הצגת קטגוריה,חובה כשרות'
const row = (code, show, kashrut) =>
    `לחם,1,ביצים,101,ביצים מיוחדות,1010,מוצר,${code},${show},${kashrut}`
const csv = (...rows) => [HEADER, ...rows].join('\r\n')

function fakeDL() {
    // bulkWrite updates the in-memory rows, so the sweep that runs right after
    // the import sees the flags the import just wrote.
    const mapRows = [
        { subGroupCode: '10100', showOnSite: true, requireKashrut: false },
        { subGroupCode: '10101', showOnSite: true, requireKashrut: false }
    ]
    const products = [
        { barcode: '1', status: 'active', comaxSubGroupCode: '10100' },
        { barcode: '2', status: 'active', comaxSubGroupCode: '10101', kashrut: { rabbinates: [{ code: '67085' }] } },
        { barcode: '3', status: 'archived', comaxSubGroupCode: '10100' }
    ]
    const flagWrites = []
    const productWrites = []

    const DL = {
        CategoryMap: {
            read: async () => mapRows,
            bulkWrite: async ({ docs }) => {
                flagWrites.push(...docs)
                for (const doc of docs) {
                    const target = mapRows.find(item => item.subGroupCode === doc.subGroupCode)
                    if (target) Object.assign(target, {
                        showOnSite: doc.showOnSite,
                        requireKashrut: doc.requireKashrut
                    })
                }
            }
        },
        Product: {
            constants: { STATUS: { ACTIVE: 'active', HIDDEN: 'hidden' } },
            Model: {
                find: filter => ({
                    lean: async () => products.filter(product => product.status === filter.status)
                })
            },
            bulkWrite: async ({ docs }) => { productWrites.push(...docs) }
        }
    }

    return { DL, flagWrites, productWrites }
}

describe('category flags import API', () => {
    it('writes the flags and hides the affected active products', async () => {
        const { DL, flagWrites, productWrites } = fakeDL()

        const summary = await importCategoryFlags({
            csvText: csv(
                row('10100', 'FALSE', 'TRUE'),
                row('10101', 'TRUE', 'FALSE')
            ),
            filename: 'flags.csv'
        }, { DL })

        assert.deepEqual(flagWrites, [{
            subGroupCode: '10100',
            showOnSite: false,
            requireKashrut: true,
            previous: { showOnSite: true, requireKashrut: false }
        }])
        assert.deepEqual(productWrites.map(doc => doc.barcode), ['1'])
        assert.deepEqual(summary, {
            filename: 'flags.csv',
            codes: 2,
            written: 1,
            unchanged: 1,
            unknown: 0,
            skipped: 0,
            untouched: 0,
            relaxed: 0,
            hidden: 1,
            unhidden: 0,
            reasons: { category: 0, categoryActive: 0, kashrut: 0, both: 1 }
        })
    })

    // The reason an upload has to reconcile both directions: a sub-group that
    // turned back on must show its products in the storefront right away.
    it('brings back the hidden products of a sub-group whose flags were relaxed', async () => {
        const mapRows = [{ subGroupCode: '10100', showOnSite: false, requireKashrut: false }]
        const products = [
            {
                barcode: '7',
                status: 'hidden',
                comaxSubGroupCode: '10100',
                images: { product: [{ main: true }] }
            }
        ]
        const comaxRows = [{
            barcode: '7',
            active: true,
            isTrailingItem: false,
            archived: false,
            price: 10,
            priceWithTrailing: 10,
            buyingPrice: 5,
            showInWeb: true,
            storeIds: ['s1']
        }]
        const productWrites = []
        const DL = {
            CategoryMap: {
                read: async () => mapRows,
                // The sweep runs after the import, so it must see the flags
                // the import just wrote.
                bulkWrite: async ({ docs }) => {
                    for (const doc of docs) Object.assign(mapRows[0], {
                        showOnSite: doc.showOnSite,
                        requireKashrut: doc.requireKashrut
                    })
                }
            },
            ComaxProduct: {
                count: async () => comaxRows.filter(row => row.buyingPrice > 0).length,
                read: async filter => comaxRows.filter(row => filter.barcode.$in.includes(row.barcode))
            },
            Product: {
                constants: { STATUS: { ACTIVE: 'active', HIDDEN: 'hidden', ARCHIVED: 'archived' } },
                Model: {
                    find: filter => ({
                        lean: async () => products.filter(product => product.status === filter.status)
                    })
                },
                bulkWrite: async ({ docs }) => { productWrites.push(...docs) }
            }
        }

        const summary = await importCategoryFlags({
            csvText: csv(row('10100', 'TRUE', 'FALSE')),
            filename: 'flags.csv'
        }, { DL })

        assert.equal(summary.written, 1)
        assert.equal(summary.relaxed, 1)
        assert.equal(summary.hidden, 0)
        assert.equal(summary.unhidden, 1)
        assert.deepEqual(productWrites, [{
            barcode: '7',
            previousStatus: 'hidden',
            status: 'active',
            storeIds: ['s1']
        }])
    })

    it('accepts the browser data-url payload', async () => {
        const { DL, flagWrites } = fakeDL()
        const csvBase64 = `data:text/csv;base64,${Buffer.from(csv(
            row('10100', 'FALSE', 'FALSE')
        )).toString('base64')}`

        const summary = await importCategoryFlags({ csvBase64 }, { DL })

        assert.equal(summary.written, 1)
        assert.equal(flagWrites.length, 1)
    })

    it('rejects a request without a file', async () => {
        const { DL } = fakeDL()

        await assert.rejects(
            () => importCategoryFlags({}, { DL }),
            { status: 400, message: 'csvBase64 required' }
        )
    })

    it('is writable only with the category update permission', () => {
        assert.deepEqual(importCategoryFlags.config, {
            permissions: ['category:update'],
            preventMultiple: true
        })
    })
})
