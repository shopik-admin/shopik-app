import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getUnitPriceText, parseWeightOrVolume, isWeightProduct } from '../../common/functions/unitPrice.js'

describe('parseWeightOrVolume', () => {
    it('parses grams from netContentText', () => {
        const res = parseWeightOrVolume({ netContentText: '200 גרם' })
        assert.deepEqual(res, { amount: 200, type: 'weight', label: 'ל-100 גרם' })
    })

    it('parses grams with quotes/gershayim', () => {
        const res1 = parseWeightOrVolume({ netContentText: "400 גר'" })
        assert.deepEqual(res1, { amount: 400, type: 'weight', label: 'ל-100 גרם' })

        const res2 = parseWeightOrVolume({ netContentText: "75 ג'" })
        assert.deepEqual(res2, { amount: 75, type: 'weight', label: 'ל-100 גרם' })
    })

    it('parses kilograms from netContentText', () => {
        const res1 = parseWeightOrVolume({ netContentText: '1 ק"ג' })
        assert.deepEqual(res1, { amount: 1000, type: 'weight', label: 'ל-100 גרם' })

        const res2 = parseWeightOrVolume({ netContentText: '0.5 קג' })
        assert.deepEqual(res2, { amount: 500, type: 'weight', label: 'ל-100 גרם' })

        const res3 = parseWeightOrVolume({ netContentText: '1.5 קילו' })
        assert.deepEqual(res3, { amount: 1500, type: 'weight', label: 'ל-100 גרם' })
    })

    it('parses milliliters from netContentText', () => {
        const res1 = parseWeightOrVolume({ netContentText: '330 מל' })
        assert.deepEqual(res1, { amount: 330, type: 'liquid', label: 'ל-100 מ"ל' })

        const res2 = parseWeightOrVolume({ netContentText: '50 מ"ל' })
        assert.deepEqual(res2, { amount: 50, type: 'liquid', label: 'ל-100 מ"ל' })
    })

    it('parses liters from netContentText', () => {
        const res1 = parseWeightOrVolume({ netContentText: '1 ליטר' })
        assert.deepEqual(res1, { amount: 1000, type: 'liquid', label: 'ל-100 מ"ל' })

        const res2 = parseWeightOrVolume({ netContentText: '1.5 ליטר' })
        assert.deepEqual(res2, { amount: 1500, type: 'liquid', label: 'ל-100 מ"ל' })
    })

    it('parses multi-pack from netContentText', () => {
        const res1 = parseWeightOrVolume({ netContentText: "125X4ג'" })
        assert.deepEqual(res1, { amount: 500, type: 'weight', label: 'ל-100 גרם' })

        const res2 = parseWeightOrVolume({ netContentText: '4 * 100 גרם' })
        assert.deepEqual(res2, { amount: 400, type: 'weight', label: 'ל-100 גרם' })

        const res3 = parseWeightOrVolume({ netContentText: '6 יח\' * 200 גרם' })
        assert.deepEqual(res3, { amount: 1200, type: 'weight', label: 'ל-100 גרם' })
    })

    it('falls back to product name when netContentText is missing or has no unit', () => {
        const res1 = parseWeightOrVolume({ name: "גבינה עמק 28% פרוס 200 ג' בדצ" })
        assert.deepEqual(res1, { amount: 200, type: 'weight', label: 'ל-100 גרם' })

        const res2 = parseWeightOrVolume({ name: 'סלומון נורווגי מצונן 100גרם' })
        assert.deepEqual(res2, { amount: 100, type: 'weight', label: 'ל-100 גרם' })

        const res3 = parseWeightOrVolume({ name: 'המבורגר 100% 400 גר' })
        assert.deepEqual(res3, { amount: 400, type: 'weight', label: 'ל-100 גרם' })
    })

    it('returns null for non-weight / non-liquid products', () => {
        assert.equal(parseWeightOrVolume({ netContentText: '20 יחידות' }), null)
        assert.equal(parseWeightOrVolume({ name: 'צלחות חד פעמיות 50 יח\'' }), null)
        assert.equal(parseWeightOrVolume(null), null)
        assert.equal(parseWeightOrVolume({}), null)
    })
})

describe('getUnitPriceText', () => {
    it('calculates price per 100g for Yoplait 200g (screenshot example)', () => {
        // Price 7.90 for 200g -> 7.90 / 2 = 3.95 per 100g
        const product = {
            price: 7.9,
            netContentText: '200 גרם',
            name: 'יופלה גו 200 גרם'
        }
        assert.equal(getUnitPriceText(product), '3.95 ל-100 גרם')
    })

    it('calculates price per 100g for weighable products (per kg)', () => {
        // Price 5.90 per kg -> 0.59 per 100g
        const product = {
            price: 5.9,
            unit: { type: 'weight', baseUnit: 'kg' }
        }
        assert.equal(getUnitPriceText(product), '0.59 ל-100 גרם')
    })

    it('formats integers cleanly without trailing decimals', () => {
        const product = {
            price: 10,
            unit: { type: 'weight', baseUnit: 'kg' }
        }
        assert.equal(getUnitPriceText(product), '1 ל-100 גרם')
    })

    it('calculates price per 100 ml for beverages/liquids', () => {
        const product = {
            price: 3.9,
            netContentText: '330 מל',
            name: 'שוופס תות פחית'
        }
        // 3.90 / 330 * 100 = 1.1818... -> 1.18
        assert.equal(getUnitPriceText(product), '1.18 ל-100 מ"ל')

        const bottle = {
            price: 6,
            netContentText: '1.5 ליטר',
            name: 'קולה 1.5 ליטר'
        }
        // 6 / 1500 * 100 = 0.40
        assert.equal(getUnitPriceText(bottle), '0.40 ל-100 מ"ל')
    })

    it('supports custom price override', () => {
        const product = {
            price: 10,
            netContentText: '200 גרם'
        }
        // With price override 6: 6 / 200 * 100 = 3
        assert.equal(getUnitPriceText(product, 6), '3 ל-100 גרם')
    })

    it('returns empty string when not applicable or price missing', () => {
        assert.equal(getUnitPriceText(null), '')
        assert.equal(getUnitPriceText({ price: 0, netContentText: '200 גרם' }), '')
        assert.equal(getUnitPriceText({ price: 10, netContentText: '20 יחידות' }), '')
        assert.equal(getUnitPriceText({ price: 10, name: 'מחברת שורות' }), '')
    })
})
