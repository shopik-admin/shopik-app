import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    BASE_RULES,
    effectiveStoreIds,
    pathFor,
    pathsForComax,
    resolveRules
} from '../../server/services/comaxCategorySettings/index.js'
import { buildKeptBarcodesWithRules } from '../../server/api/comax_product/salesWindow.js'

const codes = {
    superDepartmentCode: '3',
    departmentCode: '13',
    groupCode: '4',
    subGroupCode: '7'
}

function settings(...rows) {
    return new Map(rows.map(row => [row.path, row]))
}

describe('comax category settings paths', () => {
    it('builds one path per hierarchy level', () => {
        assert.equal(pathFor('superDepartment', codes), '3')
        assert.equal(pathFor('department', codes), '3/13')
        assert.equal(pathFor('group', codes), '3/13/4')
        assert.equal(pathFor('subGroup', codes), '3/13/4/7')
        assert.equal(pathFor('global', codes), 'global')
        assert.deepEqual(pathsForComax(codes), ['global', '3', '3/13', '3/13/4', '3/13/4/7'])
    })
})

describe('comax category rule inheritance', () => {
    it('uses the existing sale/stock defaults when nothing is configured', () => {
        assert.deepEqual(resolveRules(new Map(), codes), BASE_RULES)
    })

    it('lets the deepest level win', () => {
        const byPath = settings(
            { path: '3', level: 'superDepartment', saleEnabled: true, saleDays: 60 },
            { path: '3/13', level: 'department', saleDays: 20, stockEnabled: true, minStock: 5 },
            { path: '3/13/4', level: 'group', stockEnabled: false },
            { path: '3/13/4/7', level: 'subGroup', saleDays: 7, hidden: true }
        )

        assert.deepEqual(resolveRules(byPath, codes), {
            saleEnabled: true,
            saleDays: 7,
            stockEnabled: false,
            minStock: 5,
            hidden: true,
            requireKashrut: false
        })
    })

    it('treats an explicit false as an override, not as a missing value', () => {
        const byPath = settings(
            { path: '3', level: 'superDepartment', saleEnabled: true, stockEnabled: true },
            { path: '3/13/4/7', level: 'subGroup', saleEnabled: false, stockEnabled: false }
        )

        const rule = resolveRules(byPath, codes)
        assert.equal(rule.saleEnabled, false)
        assert.equal(rule.stockEnabled, false)
    })

    it('inherits only the fields a deeper row actually sets', () => {
        const byPath = settings(
            { path: '3/13', level: 'department', saleDays: 14, stockEnabled: true, minStock: 4 },
            { path: '3/13/4/7', level: 'subGroup', hidden: true }
        )

        const rule = resolveRules(byPath, codes)
        assert.equal(rule.saleDays, 14)
        assert.equal(rule.minStock, 4)
        assert.equal(rule.hidden, true)
    })

    it('uses the global default when a node turns a gate on with an empty value', () => {
        const byPath = settings(
            { path: 'global', level: 'global', saleEnabled: true, saleDays: 30 },
            { path: '3/13', level: 'department', saleDays: 14 },
            { path: '3/13/4/7', level: 'subGroup', saleEnabled: true, stockEnabled: true }
        )

        const rule = resolveRules(byPath, codes)
        assert.equal(rule.saleDays, 30)
        assert.equal(rule.minStock, 0)
    })
})

describe('comax category effective stores', () => {
    const active = ['store-a', 'store-b', 'store-c']

    it('includes a store only when its balance reaches the minimum', () => {
        const comax = {
            storeIds: ['store-a', 'store-b'],
            stockByStore: { 'store-a': 2, 'store-b': 9 }
        }

        assert.deepEqual(
            effectiveStoreIds(comax, { ...BASE_RULES, stockEnabled: true, minStock: 5, saleEnabled: false }, active),
            ['store-b']
        )
    })

    it('passes a store whose balance is unknown', () => {
        const comax = { storeIds: ['store-a', 'store-b'], stockByStore: { 'store-b': 2 } }

        assert.deepEqual(
            effectiveStoreIds(comax, { ...BASE_RULES, stockEnabled: true, minStock: 5, saleEnabled: false }, active),
            ['store-a']
        )
    })

    it('shows a stock-disabled category in every active store, even at zero stock', () => {
        const comax = { storeIds: [], stockByStore: {} }

        assert.deepEqual(
            effectiveStoreIds(comax, { ...BASE_RULES, stockEnabled: false, saleEnabled: false }, active),
            active
        )
    })

    it('still applies the sale gate when the stock gate is off', () => {
        const comax = {
            storeIds: ['store-a'],
            saleStoreIds: ['store-b'],
            saleCheckedStores: ['store-a', 'store-b', 'store-c'],
            stockByStore: { 'store-a': 0 }
        }

        assert.deepEqual(
            effectiveStoreIds(comax, { ...BASE_RULES, stockEnabled: false, saleEnabled: true, saleDays: 30 }, active),
            ['store-b']
        )
    })

    it('still applies the stock gate when the sale gate is off', () => {
        const comax = {
            storeIds: ['store-a', 'store-b'],
            stockByStore: { 'store-a': 1, 'store-b': 8 }
        }

        assert.deepEqual(
            effectiveStoreIds(comax, { ...BASE_RULES, stockEnabled: true, minStock: 5, saleEnabled: false }, active),
            ['store-b']
        )
    })

    it('fails open for a store the sale feed did not check', () => {
        const comax = {
            storeIds: ['store-a', 'store-b'],
            saleStoreIds: [],
            saleCheckedStores: ['store-a']
        }

        assert.deepEqual(
            effectiveStoreIds(comax, { ...BASE_RULES, stockEnabled: false, saleEnabled: true }, active),
            ['store-b', 'store-c']
        )
    })

    it('treats a checked store with no saleStoreIds as not sold', () => {
        const comax = {
            storeIds: ['store-a'],
            saleCheckedStores: ['store-a']
        }

        assert.deepEqual(
            effectiveStoreIds(comax, { ...BASE_RULES, stockEnabled: true, saleEnabled: true }, active),
            []
        )
    })

    it('passes every store when the sale window is 0', () => {
        const comax = {
            storeIds: ['store-a'],
            saleCheckedStores: ['store-a'],
            saleStoreIds: []
        }

        assert.deepEqual(
            effectiveStoreIds(comax, { ...BASE_RULES, stockEnabled: false, saleEnabled: true, saleDays: 0 }, active),
            active
        )
    })

    it('keeps a never-tracked product untouched', () => {
        assert.equal(effectiveStoreIds({}, BASE_RULES, active), null)
    })
})

describe('comax category sale decision', () => {
    const now = new Date(2026, 10, 1, 12, 0, 0)
    const daysAgo = days => new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    const ruleLookup = {
        bySubGroupCode: new Map([
            ['7', { saleEnabled: true, saleDays: 14, stockEnabled: true, minStock: 0, hidden: false }]
        ]),
        settingsByPath: settings(
            { path: 'global', level: 'global', saleEnabled: true, saleDays: 30 }
        ),
        ruleFor(row) {
            const code = row?.subGroupCode == null ? null : String(row.subGroupCode)
            return this.bySubGroupCode.get(code) || { saleEnabled: true, saleDays: 30, stockEnabled: true, minStock: 0, hidden: false }
        }
    }

    it('keeps a row inside its sub-group window', () => {
        const { kept } = buildKeptBarcodesWithRules([
            { barcode: 'a', subGroupCode: '7', lastSaleDate: daysAgo(10) }
        ], ruleLookup, now)
        assert.deepEqual([...kept], ['a'])
    })

    it('drops a row outside its sub-group window', () => {
        const { kept } = buildKeptBarcodesWithRules([
            { barcode: 'a', subGroupCode: '7', lastSaleDate: daysAgo(20) }
        ], ruleLookup, now)
        assert.equal(kept.size, 0)
    })

    it('keeps every row when the category sale gate is off', () => {
        const off = {
            ...ruleLookup,
            ruleFor: () => ({ saleEnabled: false, saleDays: 0, stockEnabled: true, minStock: 0, hidden: false })
        }
        const { kept } = buildKeptBarcodesWithRules([
            { barcode: 'a', subGroupCode: '7', lastSaleDate: daysAgo(400) }
        ], off, now)
        assert.deepEqual([...kept], ['a'])
    })
})
