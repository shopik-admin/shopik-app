import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildProduct } from '../../server/api/comax_product/sync.js'

const STATUS = { ACTIVE: 'active', HIDDEN: 'hidden', ARCHIVED: 'archived' }
const UNIT = { ITEM: 'item', WEIGHT: 'weight' }
const BASE_UNIT = { UNIT: 'unit', KG: 'kg' }

const DL = { Product: { constants: { STATUS, UNIT, BASE_UNIT } } }

function comaxProduct(overrides = {}) {
    return {
        barcode: '7290000000000',
        name: 'מוצר',
        price: 10,
        buyingPrice: 6,
        vat: true,
        showInWeb: true,
        superDepartmentCode: '3',
        departmentCode: '30',
        groupCode: '301',
        ...overrides
    }
}

function existingProduct(overrides = {}) {
    return {
        images: { product: [{ url: 'https://example.com/a.jpg' }] },
        prices: [],
        ...overrides
    }
}

const build = (comax = {}, existing = existingProduct(), enforceBuyingPrice = false, lookup) =>
    buildProduct(comaxProduct(comax), DL, 'default', existing, enforceBuyingPrice, lookup)

describe('comax product build', () => {
    it('hides an item that is in stock in no store', () => {
        const product = build({ storeIds: [] })

        assert.equal(product.status, STATUS.HIDDEN)
        assert.deepEqual(product.storeIds, [])
    })

    it('copies a non-empty store list next to an active status', () => {
        const product = build({ storeIds: ['store-a', 'store-b'] })

        assert.equal(product.status, STATUS.ACTIVE)
        assert.deepEqual(product.storeIds, ['store-a', 'store-b'])
    })

    it('leaves storeIds untouched when the import never tracked the item', () => {
        const product = build()

        assert.equal(product.status, STATUS.ACTIVE)
        assert.equal('storeIds' in product, false)
    })

    it('copies the summed sales units onto the product', () => {
        assert.equal(build({ salesLastDays: 14.75 }).totalSalesUnits, 14.75)
    })

    it('stores 0 units for an item that sold nothing in the window', () => {
        assert.equal(build({ salesLastDays: 0 }).totalSalesUnits, 0)
    })

    it('leaves totalSalesUnits untouched when the import never measured it', () => {
        assert.equal('totalSalesUnits' in build(), false)
    })

    it('keeps an archived item archived even when it is in stock', () => {
        assert.equal(build({ archived: true, storeIds: ['store-a'] }).status, STATUS.ARCHIVED)
    })

    it('archives an item without a sale price even when it is in stock', () => {
        assert.equal(build({ price: 0, storeIds: ['store-a'] }).status, STATUS.ARCHIVED)
    })

    it('archives an item without a buying price when buying prices are enforced', () => {
        const product = build({ buyingPrice: 0, storeIds: ['store-a'] }, existingProduct(), true)

        assert.equal(product.status, STATUS.ARCHIVED)
    })

    it('hides an item with an image and stock but showInWeb off', () => {
        assert.equal(build({ showInWeb: false, storeIds: ['store-a'] }).status, STATUS.HIDDEN)
    })

    it('hides an item that has no image even when it is in stock', () => {
        const product = build({ storeIds: ['store-a'] }, existingProduct({ images: { product: [] } }))

        assert.equal(product.status, STATUS.HIDDEN)
    })

    it('maps the comax sub-group through the category map', () => {
        const lookup = {
            hasMap: true,
            mapByCode: new Map([['92410', 'nc:9:904:9142:92410']]),
            categoriesById: new Map([[
                'nc:9:904:9142:92410',
                {
                    id: 'nc:9:904:9142:92410',
                    name: 'בגדי ים',
                    parentIds: ['nc:9', 'nc:9:904', 'nc:9:904:9142']
                }
            ]])
        }

        const product = build({ subGroupCode: '92410' }, existingProduct(), false, lookup)

        assert.equal(product.comaxSubGroupCode, '92410')
        assert.deepEqual(product.category, {
            id: 'nc:9:904:9142:92410',
            title: 'בגדי ים',
            pathIds: ['nc:9', 'nc:9:904', 'nc:9:904:9142', 'nc:9:904:9142:92410']
        })
    })

    it('clears the category for an unassigned sub-group once a map exists', () => {
        const lookup = {
            hasMap: true,
            mapByCode: new Map([['1', null]]),
            categoriesById: new Map()
        }

        const product = build({ subGroupCode: '1' }, existingProduct({ category: { id: 'old' } }), false, lookup)

        assert.deepEqual(product.category, {})
    })

    it('keeps the stored category before the first map import', () => {
        const category = { id: 'sg:1', title: 'ישן', pathIds: ['sg:1'] }

        const product = build({ subGroupCode: '1' }, existingProduct({ category }))

        assert.deepEqual(product.category, category)
    })

    describe('category flags', () => {
        const lookupWith = flags => ({
            hasMap: true,
            mapByCode: new Map([['100', null]]),
            flagsByCode: new Map([['100', flags]]),
            categoriesById: new Map()
        })

        it('hides an item in a sub-group marked hide on site', () => {
            const product = build(
                { subGroupCode: '100', storeIds: ['store-a'] },
                existingProduct(),
                false,
                lookupWith({ showOnSite: false, requireKashrut: false })
            )

            assert.equal(product.status, STATUS.HIDDEN)
        })

        it('hides an item in a kashrut-required sub-group with no kashrut data', () => {
            const product = build(
                { subGroupCode: '100', storeIds: ['store-a'] },
                existingProduct(),
                false,
                lookupWith({ showOnSite: true, requireKashrut: true })
            )

            assert.equal(product.status, STATUS.HIDDEN)
        })

        it('hides an item whose rabbinate code is not on the valid list', () => {
            const product = build(
                { subGroupCode: '100', storeIds: ['store-a'] },
                existingProduct({ kashrut: { rabbinates: [{ code: '67011', name: 'הרבנות הראשית' }] } }),
                false,
                lookupWith({ showOnSite: true, requireKashrut: true })
            )

            assert.equal(product.status, STATUS.HIDDEN)
        })

        it('keeps an item with a valid rabbinate code', () => {
            const product = build(
                { subGroupCode: '100', storeIds: ['store-a'] },
                existingProduct({ kashrut: { rabbinates: [{ code: '67085' }] } }),
                false,
                lookupWith({ showOnSite: true, requireKashrut: true })
            )

            assert.equal(product.status, STATUS.ACTIVE)
        })

        it('does not resurrect an archived item through its flags', () => {
            const product = build(
                { archived: true, subGroupCode: '100', storeIds: ['store-a'] },
                existingProduct({ kashrut: { rabbinates: [{ code: '67085' }] } }),
                false,
                lookupWith({ showOnSite: true, requireKashrut: true })
            )

            assert.equal(product.status, STATUS.ARCHIVED)
        })

        it('keeps a normal item active when its sub-group has no flags', () => {
            const lookup = {
                hasMap: true,
                mapByCode: new Map([['100', null]]),
                flagsByCode: new Map(),
                categoriesById: new Map()
            }

            assert.equal(
                build({ subGroupCode: '100', storeIds: ['store-a'] }, existingProduct(), false, lookup).status,
                STATUS.ACTIVE
            )
        })
    })
})
