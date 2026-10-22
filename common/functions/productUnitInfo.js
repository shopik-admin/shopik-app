// The info line that sits between the price and the product name.
// Format: "<size/weight> | <brand>" — e.g. "125 גרם | תנובה".
//
// There is no fallback: when there is no size and no brand the line is empty
// and the caller hides it. A made-up weight is worse than no line at all.

export function getUnitLabel(product) {
    const unit = product?.unit || {}
    const type = unit.type
    const base = unit.baseUnit
    if (type === 'weight') {
        if (base === 'kg') return 'ק"ג'
        if (base === 'g') return 'גרם'
        return 'ק"ג'
    }
    if (base === 'kg') return 'ק"ג'
    if (base === 'g') return 'גרם'
    return "יח'"
}

// A bare number says nothing without its unit. GS1 sends those when the net
// content has no unit ("0.07"), and "0.07" alone on a card is noise.
function withUnit(text) {
    const trimmed = String(text ?? '').trim()
    if (!trimmed) return ''
    return /[^\d.,\s]/.test(trimmed) ? trimmed : ''
}

// The net weight of the pack, as GS1 reports it: { text: "125 גרם", UOM:
// "גרם", value: "125" } — but also a bare string ("300 גרם") or a plain
// number+unit pair.
export function getNetContentText(netContent) {
    if (netContent == null) return ''
    if (typeof netContent === 'string' || typeof netContent === 'number')
        return withUnit(netContent)
    if (Array.isArray(netContent))
        return netContent.map(getNetContentText).filter(Boolean).join(', ')
    if (typeof netContent !== 'object') return ''

    const text = netContent.text != null ? String(netContent.text) : ''
    const value = netContent.value != null ? String(netContent.value) : ''
    const uom = netContent.UOM != null ? String(netContent.UOM) : ''
    return withUnit(text) || withUnit(value && uom ? `${value} ${uom}` : value)
}

// The size side of the line, when the product has no net content.
// `product.unit` is the current shape; the flat `unitType`/`unitBase`/
// `unitAmount` fields are the legacy spelling of the same data.
function getUnitText(product) {
    const unit = product.unit
    const type = unit?.type || product.unitType
    const base = unit?.baseUnit || product.unitBase
    const amount = unit?.amount ?? product.unitAmount

    if (type === 'weight') {
        if (base === 'kg') return amount ? `${amount} ק"ג` : 'משקל'
        if (base === 'g') return amount ? `${amount} גרם` : 'משקל'
        return 'משקל'
    }
    if (type === 'pack' || type === 'item') return amount ? `${amount} יח'` : ''
    return ''
}

export function getUnitInfoText(product) {
    if (!product) return ''
    // GS1 writes the brand into `producer` (BrandName || Manufacturer_Name) and
    // the *variant* — a flavour or a sub-brand — into `label`. A variant is
    // not a brand, so `label` is only the last resort.
    const brand = product.producer || product.label || ''
    const unit = product.unit

    // A cart line with a chosen unit option — the option IS its size.
    if (unit?.option?.name) return unit.option.name
    if (unit?.option?.amount) {
        const base = unit.baseUnit === 'kg' ? 'ק"ג' : unit.baseUnit === 'g' ? 'גרם' : "יח'"
        return `${unit.option.amount} ${base}`
    }

    const size = getNetContentText(product.gs1?.netContent) || getUnitText(product)
    if (size && brand) return `${size} | ${brand}`
    return size || brand
}
