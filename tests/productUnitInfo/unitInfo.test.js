import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getUnitInfoText, getNetContentText } from '../../common/functions/productUnitInfo.js'

// The info line between the price and the product name reads
// "<size/weight> | <brand>" — e.g. "125 גרם | תנובה".
//
// The size is the net weight of the pack (GS1 "Net_Content"); the brand is
// `producer` (GS1 BrandName). `label` holds the *variant* — a flavour or a
// sub-brand — so it is only the last resort.
//
// There is no fallback: a product with neither a size nor a brand yields an
// empty line (the caller hides it) rather than an invented weight.

const weightUnit = { type: 'weight', baseUnit: 'kg', minAmount: 0.5, step: 0.5, options: [] }
const itemUnit = { type: 'item', baseUnit: 'unit', minAmount: 1, step: 1, options: [] }

describe('getNetContentText', () => {
    it('reads the GS1 net content object', () => {
        assert.equal(
            getNetContentText({ text: '125 גרם', UOM: 'גרם', value: '125' }),
            '125 גרם'
        )
    })

    it('reads a plain string', () => {
        assert.equal(getNetContentText('300 גרם'), '300 גרם')
    })

    it('builds "<value> <UOM>" when there is no text', () => {
        assert.equal(getNetContentText({ value: '0.5', UOM: 'ק"ג' }), '0.5 ק"ג')
    })

    it('drops a bare number — without a unit it says nothing', () => {
        assert.equal(getNetContentText({ text: '0.07 ', value: '0.07' }), '')
        assert.equal(getNetContentText({ text: ' 200', UOM: '200' }), '')
    })

    it('is empty for nothing', () => {
        assert.equal(getNetContentText(null), '')
        assert.equal(getNetContentText(undefined), '')
        assert.equal(getNetContentText(''), '')
    })
})

describe('getUnitInfoText', () => {
    it('puts the net weight before the brand', () => {
        const text = getUnitInfoText({
            name: 'גיל בטעם תות',
            producer: 'תנובה',
            label: 'תות',
            unit: itemUnit,
            gs1: { netContent: { text: '125 גרם', UOM: 'גרם', value: '125' } }
        })
        assert.equal(text, '125 גרם | תנובה')
    })

    it('prefers the producer over the variant label', () => {
        // `label` is the GS1 variant ("תות"), `producer` is the brand.
        const text = getUnitInfoText({ name: 'גיל', producer: 'תנובה', label: 'תות', unit: itemUnit })
        assert.equal(text, 'תנובה')
    })

    it('falls back to the label when there is no producer', () => {
        const text = getUnitInfoText({ name: 'גיל', label: 'תות', unit: itemUnit })
        assert.equal(text, 'תות')
    })

    it('falls back to the unit type when there is no net content', () => {
        const text = getUnitInfoText({ name: 'חלב', producer: 'אסם', unit: weightUnit })
        assert.equal(text, 'משקל | אסם')
    })

    it('shows the weight amount when the product has one', () => {
        const text = getUnitInfoText({
            name: 'גבינה',
            producer: 'אסם',
            unit: { ...weightUnit, baseUnit: 'g', amount: 200 }
        })
        assert.equal(text, '200 גרם | אסם')
    })

    it('shows kilograms for a kg base unit', () => {
        const text = getUnitInfoText({
            name: 'בצל',
            producer: 'אסם',
            unit: { ...weightUnit, amount: 1.5 }
        })
        assert.equal(text, '1.5 ק"ג | אסם')
    })

    it('shows only the brand when there is no size', () => {
        const text = getUnitInfoText({ name: 'חלב', producer: 'אסם', unit: itemUnit })
        assert.equal(text, 'אסם')
    })

    it('shows only the size when there is no brand', () => {
        const text = getUnitInfoText({ name: 'חלב', unit: weightUnit })
        assert.equal(text, 'משקל')
    })

    it('shows the pack amount when there is one', () => {
        const text = getUnitInfoText({
            name: 'ביצים',
            producer: 'אסם',
            unit: { type: 'pack', baseUnit: 'unit', amount: 6 }
        })
        assert.equal(text, '6 יח\' | אסם')
    })

    it('has no fallback when there is neither size nor brand', () => {
        // The old implementation ended with `return label || '200 גרם'`, which
        // invented a weight for every product that had no brand.
        assert.equal(getUnitInfoText({ name: 'חלב', unit: itemUnit }), '')
        assert.equal(getUnitInfoText({ name: 'חלב' }), '')
        assert.equal(getUnitInfoText({ name: 'חלב', unit: itemUnit, producer: '', label: '' }), '')
        assert.equal(getUnitInfoText(null), '')
    })

    it('reads the legacy flat unit fields in the same format', () => {
        const text = getUnitInfoText({
            name: 'חלב',
            producer: 'אסם',
            unitType: 'weight',
            unitBase: 'g',
            unitAmount: 200
        })
        assert.equal(text, '200 גרם | אסם')
    })

    it('uses the cart unit option as the size', () => {
        const text = getUnitInfoText({
            name: 'חלב',
            producer: 'אסם',
            unit: { ...weightUnit, option: { key: 'big', name: 'גדול (כ-10 ק"ג)' } }
        })
        assert.equal(text, 'גדול (כ-10 ק"ג)')
    })

    it('uses the cart unit option amount when it has no name', () => {
        const text = getUnitInfoText({
            name: 'חלב',
            producer: 'אסם',
            unit: { ...weightUnit, option: { key: 'big', amount: 10 } }
        })
        assert.equal(text, '10 ק"ג')
    })
})
