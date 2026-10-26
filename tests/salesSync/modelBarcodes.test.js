import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    modelKodsForSale,
    modelBarcodesForSale,
    buildModelKodToBarcodes
} from '../../server/api/comax_sale/sync.js'

function ref(Kod, over = {}) {
    return {
        C: '0',
        Kod,
        PrintImage: false,
        SwNotActive: false,
        ExerciseCostUnit: 0,
        BasketNum: 0,
        ...over
    }
}

describe('comax sale model references', () => {
    it('reads the active model Kods of a sale', () => {
        const cs = { itemsModel: [ref('22068516'), ref('22068516'), ref('22010113'), ref('0')] }

        assert.deepEqual(modelKodsForSale(cs), ['22068516', '22010113'])
    })

    it('skips inactive model references', () => {
        const cs = { itemsModel: [ref('22068516', { SwNotActive: true }), ref('22010113')] }

        assert.deepEqual(modelKodsForSale(cs), ['22010113'])
    })

    it('handles a sale with no itemsModel', () => {
        assert.deepEqual(modelKodsForSale({}), [])
        assert.deepEqual(modelKodsForSale({ itemsModel: [] }), [])
    })

    it('maps every product that carries the model in models.id', () => {
        const products = [
            { barcode: '111', models: [{ id: '22068516', name: 'ELVIVE' }] },
            { barcode: '222', models: [{ id: '22068516', name: 'ELVIVE' }, { id: 'other', name: 'x' }] },
            { barcode: '333', models: [{ id: 'other', name: 'x' }] }
        ]

        const map = buildModelKodToBarcodes(products, new Set(['22068516']))

        assert.deepEqual(map.get('22068516'), ['111', '222'])
        assert.equal(map.has('other'), false)
    })

    it('deduplicates a barcode listed under the same model twice', () => {
        const products = [
            { barcode: '111', models: [{ id: 'm1' }, { id: 'm1' }] }
        ]

        assert.deepEqual(buildModelKodToBarcodes(products, new Set(['m1'])).get('m1'), ['111'])
    })

    it('expands a sale to all barcodes of its models', () => {
        const cs = { itemsModel: [ref('m1'), ref('m2')] }
        const map = new Map([
            ['m1', ['111', '222']],
            ['m2', ['333']]
        ])

        assert.deepEqual(modelBarcodesForSale(cs, map), ['111', '222', '333'])
    })

    it('is empty when the model map is missing', () => {
        assert.deepEqual(modelBarcodesForSale({ itemsModel: [ref('m1')] }), [])
    })
})
