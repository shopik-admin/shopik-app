import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mapItem, extractBuyingPrice, isVatExempt } from '../../server/external/comax/mapper.js'

const DELIVERY = '255'

function row(priceListId, price, isIncludeVat = false) {
    return { PriceListID: priceListId, Price: price, IsIncludeVat: isIncludeVat }
}

function item(overrides = {}) {
    return {
        ID: 1,
        Barcode: '123',
        Name: 'מוצר',
        Price: 12.5,
        DepartmentCode: 3,
        Department: 'מחלקה',
        Group: 'קבוצה',
        Sub_Group: 'תת קבוצה',
        ...overrides
    }
}

describe('comax item mapping', () => {
    it('reads the price array from SalesPrice.ClsItemPrices', () => {
        const mapped = mapItem(item({
            SalesPrice: { ClsItemPrices: [row(DELIVERY, 9, false), row(1069, 12.5, true)] }
        }))

        assert.deepEqual(mapped.prices, [
            { priceListId: '255', price: 9 },
            { priceListId: '1069', price: 12.5 }
        ])
    })

    it('normalises a single price row into an array', () => {
        const mapped = mapItem(item({ SalesPrice: { ClsItemPrices: row(1069, 12.5, true) } }))

        assert.deepEqual(mapped.prices, [{ priceListId: '1069', price: 12.5 }])
    })

    it('has no prices when the response carries no SalesPrice block', () => {
        assert.deepEqual(mapItem(item()).prices, [])
    })

    it('takes the buying price from the delivery price row', () => {
        const mapped = mapItem(
            item({ SalesPrice: { ClsItemPrices: [row(1069, 12.5, true), row(DELIVERY, 7.25)] } }),
            { deliveryPriceListId: DELIVERY }
        )

        assert.equal(mapped.buyingPrice, 7.25)
    })

    it('clears the buying price when the delivery row is zero', () => {
        const mapped = mapItem(
            item({ SalesPrice: { ClsItemPrices: [row(1069, 12.5, true), row(DELIVERY, 0)] } }),
            { deliveryPriceListId: DELIVERY }
        )

        assert.equal(mapped.buyingPrice, null)
    })

    it('leaves the stored buying price alone when the delivery row is absent', () => {
        const mapped = mapItem(
            item({ SalesPrice: { ClsItemPrices: [row(1069, 12.5, true)] } }),
            { deliveryPriceListId: DELIVERY }
        )

        assert.equal(mapped.buyingPrice, undefined)
    })

    it('compares numeric price-list ids as strings', () => {
        assert.equal(extractBuyingPrice(item({
            SalesPrice: { ClsItemPrices: [row(255, 4)] }
        }), 255), 4)
    })
})

describe('comax vat derivation', () => {
    it('is taxed by default', () => {
        assert.equal(mapItem(item()).vat, true)
    })

    it('exempts a department whose name says ללא מע"מ', () => {
        assert.equal(isVatExempt(item({ Department: 'מוצרים ללא מע"מ' })), true)
        assert.equal(mapItem(item({ Department: 'מוצרים ללא מע"מ' })).vat, false)
    })

    it('exempts every spelling of the gershayim', () => {
        for (const name of ['ללא מע"מ', 'ללא מעמ', 'ללא מע״מ', "ללא מע'מ"]) {
            assert.equal(isVatExempt(item({ Department: name })), true, name)
        }
    })

    it('exempts fresh produce (department 13) even though its name does not say so', () => {
        assert.equal(isVatExempt(item({ DepartmentCode: 13, Department: 'פירות וירקות טריים' })), true)
        assert.equal(mapItem(item({ DepartmentCode: 13, Department: 'פירות וירקות טריים' })).vat, false)
    })

    it('keeps the taxed produce department taxed', () => {
        assert.equal(isVatExempt(item({ DepartmentCode: 9, Department: 'ירקות פירות עם מע"מ' })), false)
    })

    it('checks the group and sub-group names too', () => {
        assert.equal(isVatExempt(item({ Group: 'תמרים ללא מע"מ' })), true)
        assert.equal(isVatExempt(item({ Sub_Group: 'ללא מע"מ - זכיין' })), true)
    })

    it('does not treat a plain מחלקה as exempt', () => {
        assert.equal(isVatExempt(item({ Department: 'מחלקה', Group: 'קבוצה', Sub_Group: 'תת' })), false)
    })
})
