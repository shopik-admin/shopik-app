import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildCategoryPlan, categoryIdFor, parseCsvRows } from '../../server/services/categoryMap/parse.js'

const HEADER = 'שם מחלקת על,מחלקת על,שם מחלקה,מחלקה,שם קבוצה,קבוצה,שם,קוד,רמה 1 באתר,קוד רמה 1,רמה 2 באתר,קוד רמה 2,רמה 3 באתר,קוד רמה 3'

function csv(...rows) {
    return [HEADER, ...rows].join('\r\n')
}

describe('category map CSV', () => {
    it('parses quoted commas and keeps the expected columns', () => {
        const rows = parseCsvRows(csv(
            'מחלקת על,1,מחלקה,10,קבוצה,100,מוצר,1001,"מזון, קפה",20,מוצרים,200,לחם,2001'
        ))
        assert.equal(rows.length, 2)
        assert.equal(rows[1][8], 'מזון, קפה')
    })

    it('builds deterministic ids, paths and a sub-group map', () => {
        const plan = buildCategoryPlan(csv(
            'מחלקת על,1,מחלקה,10,קבוצה,100,מוצר א,1001,"מזון, קפה",20,מוצרים,200,לחם,2001',
            'מחלקת על,1,מחלקה,10,קבוצה,100,מוצר ב,1002,"מזון, קפה",20,מוצרים,200,חלב,2002',
            'מחלקת על,1,מחלקה,10,קבוצה,100,מוצר ג,1003,"מזון, קפה",20,מוצרים,200,,'
        ))

        assert.equal(plan.counts.l1, 1)
        assert.equal(plan.counts.l2, 1)
        assert.equal(plan.counts.l3, 2)
        assert.equal(plan.categories.length, 4)
        assert.equal(plan.map.length, 3)

        const l1 = plan.categories.find(category => category.level === 1)
        assert.equal(l1.id, categoryIdFor(['20']))
        assert.equal(l1.path, 'מזון-קפה')

        const l2 = plan.categories.find(category => category.level === 2)
        assert.equal(l2.id, categoryIdFor(['20', '200']))
        assert.equal(l2.path, 'מזון-קפה/מוצרים')
        assert.deepEqual(l2.parentIds, [l1.id])

        const bread = plan.categories.find(category => category.code === '2001')
        assert.equal(bread.path, 'מזון-קפה/מוצרים/לחם')
        assert.deepEqual(bread.parentIds, [l1.id, l2.id])

        const byCode = new Map(plan.map.map(row => [row.subGroupCode, row.categoryId]))
        assert.equal(byCode.get('1001'), bread.id)
        assert.equal(byCode.get('1003'), l2.id)
        assert.equal(plan.map.find(row => row.subGroupCode === '1001').subGroup, 'מוצר א')
    })

    it('rejects duplicate category codes across levels', () => {
        assert.throws(
            () => buildCategoryPlan(csv(
                'מחלקת על,1,מחלקה,10,קבוצה,100,מוצר,1001,מזון,20,מוצרים,20,לחם,2001'
            )),
            error => /duplicate category code 20/.test(error.message)
        )
    })

    it('rejects a sub-group that maps to two different categories', () => {
        assert.throws(
            () => buildCategoryPlan(csv(
                'מחלקת על,1,מחלקה,10,קבוצה,100,מוצר,1001,מזון,20,מוצרים,200,לחם,2001',
                'מחלקת על,1,מחלקה,10,קבוצה,100,מוצר,1001,מזון,20,מוצרים,200,חלב,2002'
            )),
            error => /maps to more than one category/.test(error.message)
        )
    })

    it('rejects a missing level 3 code', () => {
        assert.throws(
            () => buildCategoryPlan(csv(
                'מחלקת על,1,מחלקה,10,קבוצה,100,מוצר,1001,מזון,20,מוצרים,200,לחם,'
            )),
            error => /missing level 3 code/.test(error.message)
        )
    })
})
