import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildCategoryProducts } from '../../server/reports/catalog.js'

const STATUS = { ACTIVE: 'active', HIDDEN: 'hidden', ARCHIVED: 'archived' }

function chain(docs) {
    const value = {
        sort: () => value,
        skip: () => value,
        limit: () => value,
        lean: async () => docs
    }
    return value
}

function makeDL({ settings = [], itemOverrides = {} } = {}) {
    const item = {
        barcode: '7290000000015',
        name: 'עגבניות',
        price: 10,
        buyingPrice: 5,
        vat: true,
        archived: false,
        showInWeb: true,
        storeIds: ['s1'],
        superDepartmentCode: '3',
        departmentCode: '13',
        groupCode: '4',
        subGroupCode: '7',
        picUrl: 'https://example.com/a.jpg',
        ...itemOverrides
    }

    return {
        Domain: { readOne: async () => ({ id: 'd1' }) },
        Store: {
            Model: {
                find: () => ({
                    sort: () => ({ lean: async () => [{ id: 's1', name: 'בת ים' }] })
                })
            }
        },
        ComaxProduct: {
            Model: {
                countDocuments: async () => 1,
                exists: async () => ({ _id: 'any' }),
                find: () => chain([item])
            }
        },
        Product: {
            constants: { STATUS },
            Model: {
                find: () => chain([{
                    barcode: '7290000000015',
                    scannableBarcodes: [],
                    name: 'עגבניות אתר',
                    prices: [{ domainId: 'd1', price: 12 }],
                    kashrut: { rabbinates: [{ code: '67085' }] },
                    images: { product: [{ main: true }] }
                }])
            }
        },
        CategoryMap: {
            read: async () => [{ subGroupCode: '7', requireKashrut: false }]
        },
        ComaxCategorySetting: {
            read: async () => settings
        },
        Gs1Product: {
            Model: {
                aggregate: async () => [{
                    barcode: '7290000000015',
                    hasRaw: true,
                    assetCount: 1
                }]
            }
        }
    }
}

describe('category product preview', () => {
    it('builds a report-shaped row for the selected sub-group', async () => {
        const result = await buildCategoryProducts({
            DL: makeDL(),
            scope: {
                level: 'subGroup',
                superDepartmentCode: '3',
                departmentCode: '13',
                groupCode: '4',
                subGroupCode: '7'
            }
        })

        assert.equal(result.total, 1)
        assert.equal(result.rows.length, 1)
        const row = result.rows[0]
        assert.equal(row.barcode, '7290000000015')
        assert.equal(row.status, 'active')
        assert.equal(row.existsOnSite, true)
        assert.equal(row.reason, '')
        assert.equal(row.hasImage, true)
        assert.equal(row.inGs1, true)
        assert.deepEqual(row.stores, [{ id: 's1', name: 'בת ים', inStock: true }])
    })

    it('applies a hidden category setting to the preview status', async () => {
        const result = await buildCategoryProducts({
            DL: makeDL({
                settings: [
                    { path: 'global', level: 'global', saleEnabled: true, saleDays: 30 },
                    { path: '3/13/4/7', level: 'subGroup', hidden: true }
                ]
            }),
            scope: {
                level: 'subGroup',
                superDepartmentCode: '3',
                departmentCode: '13',
                groupCode: '4',
                subGroupCode: '7'
            }
        })

        assert.equal(result.rows[0].status, 'hidden')
        assert.match(result.rows[0].reason, /מוסתרת/)
    })

    it('shows the stored status when the ladder is ahead of the sync', async () => {
        const result = await buildCategoryProducts({
            DL: makeDL({ itemOverrides: { siteStatus: 'hidden' } }),
            scope: {
                level: 'subGroup',
                superDepartmentCode: '3',
                departmentCode: '13',
                groupCode: '4',
                subGroupCode: '7'
            }
        })

        // The filter matched `siteStatus`, so the column must show it, not the
        // ladder's forecast (which would have said active).
        assert.equal(result.rows[0].status, 'hidden')
        assert.equal(result.rows[0].statusText, 'מוסתר')
        assert.equal(result.rows[0].existsOnSite, false)
        assert.match(result.rows[0].reason, /הסטטוס הבא: פעיל/)
    })

    it('pushes search, filters and sort into the query', async () => {
        let seenFilter = null
        let seenSort = null
        const DL = makeDL()
        DL.ComaxProduct.Model.countDocuments = async filter => {
            seenFilter = filter
            return 0
        }
        DL.ComaxProduct.Model.find = () => {
            const query = {
                sort: spec => {
                    seenSort = spec
                    return query
                },
                skip: () => query,
                limit: () => query,
                lean: async () => []
            }
            return query
        }

        await buildCategoryProducts({
            DL,
            scope: {
                level: 'subGroup',
                superDepartmentCode: '3',
                departmentCode: '13',
                groupCode: '4',
                subGroupCode: '7'
            },
            search: 'עגב',
            storeIds: ['s1', 's2'],
            minSales: 2,
            maxSales: 10,
            siteStatuses: ['hidden', 'active'],
            hasImage: 'true',
            inGs1: 'false',
            kashrutValid: 'true',
            sort: 'sales',
            dir: -1
        })

        assert.equal(seenFilter.subGroupCode, '7')
        assert.equal(seenFilter.name.$regex, '^עגב')
        assert.deepEqual(seenFilter.storeIds, { $in: ['s1', 's2'] })
        assert.deepEqual(seenFilter.siteStatus, { $in: ['hidden', 'active'] })
        assert.equal(seenFilter.hasImage, true)
        assert.equal(seenFilter.inGs1, false)
        assert.equal(seenFilter.kashrutValid, true)
        assert.deepEqual(seenFilter.salesLastDays, { $gte: 2, $lte: 10 })
        assert.deepEqual(seenSort, { salesLastDays: -1, barcode: -1 })
    })

    it('keeps a single store/status filter as a scalar', async () => {
        let seenFilter = null
        const DL = makeDL()
        DL.ComaxProduct.Model.countDocuments = async filter => {
            seenFilter = filter
            return 0
        }
        DL.ComaxProduct.Model.find = () => {
            const query = {
                sort: () => query,
                skip: () => query,
                limit: () => query,
                lean: async () => []
            }
            return query
        }

        await buildCategoryProducts({
            DL,
            scope: { level: 'subGroup', subGroupCode: '7' },
            storeIds: ['s1'],
            siteStatuses: ['hidden']
        })

        assert.equal(seenFilter.storeIds, 's1')
        assert.equal(seenFilter.siteStatus, 'hidden')
    })

    it('ignores a one-character search term', async () => {
        let seenFilter = null
        const DL = makeDL()
        DL.ComaxProduct.Model.countDocuments = async filter => {
            seenFilter = filter
            return 0
        }
        DL.ComaxProduct.Model.find = () => {
            const query = {
                sort: () => query,
                skip: () => query,
                limit: () => query,
                lean: async () => []
            }
            return query
        }

        await buildCategoryProducts({
            DL,
            scope: { level: 'subGroup', subGroupCode: '7' },
            search: 'ע'
        })

        assert.equal(seenFilter.name, undefined)
        assert.equal(seenFilter.barcode, undefined)
    })
})
