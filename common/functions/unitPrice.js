import { round2 } from './calcOrder/utils.js'

export function isWeightProduct(product) {
    const t = product?.unit?.type
    return t === 'weight' || t === 'WEIGHT'
}

const RLM_REGEX = /[\u200e\u200f\u202a-\u202e]/g

function cleanText(text) {
    if (!text || typeof text !== 'string') return ''
    return text
        .replace(RLM_REGEX, '')
        .replace(/[\r\n,]+/g, ' ')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function resolveUnit(raw) {
    if (!raw) return null
    const u = raw.toLowerCase().replace(/["\u05f4'\u05f3]/g, '').trim()
    // weight: grams
    if (/^(\u05d2\u05e8\u05dd|\u05d2\u05e8|\u05d2|g|gram|grams)$/.test(u)) return { type: 'weight', factor: 1 }
    // weight: kilograms
    if (/^(\u05e7\u05d2|\u05e7\u05d9\u05dc\u05d5|kg)$/.test(u)) return { type: 'weight', factor: 1000 }
    // liquid: milliliters
    if (/^(\u05de\u05dc|ml)$/.test(u)) return { type: 'liquid', factor: 1 }
    // liquid: liters
    if (/^(\u05dc\u05d9\u05d8\u05e8|\u05dc\u05d9\u05d8\u05e8\u05d9\u05dd|\u05dc|l|liter|liters)$/.test(u)) return { type: 'liquid', factor: 1000 }
    return null
}

const UNIT_PAT = '(\u05e7["\u05f4\u2019]?\u05d2|\u05e7\u05d9\u05dc\u05d5|kg|\u05d2\u05e8\u05dd|\u05d2\u05e8[\'\u05f3]?|\u05d2[\'\u05f3]?|\\bg\\b|\u05dc\u05d9\u05d8\u05e8(?:\u05d9\u05dd)?|\u05dc[\'\u05f3]?|\\bl\\b|\u05de["\u05f4]?\u05dc|\u05de\u05dc|\\bml\\b)'
const NUM = '(\\d+(?:[.,]\\d+)?)'

const multiRe = new RegExp(
    `(?:${NUM}\\s*(?:[xX\xd7*]|\u05d9\u05d7[\'\u05f3]?\\s*[xX\xd7*])\\s*${NUM}\\s*${UNIT_PAT}` +
    `|${NUM}\\s*${UNIT_PAT}\\s*[xX\xd7*]\\s*${NUM}` +
    `|${NUM}\\s*[xX\xd7*]\\s*${NUM}\\s*${UNIT_PAT})`,
    'i'
)

const simpleRe = new RegExp(`(?:^|[^\\d.])(${NUM}\\s*${UNIT_PAT})(?:$|[^\\u0590-\\u05fea-zA-Z0-9])`, 'i')

function tryParse(text) {
    const s = cleanText(text)
    if (!s) return null

    // Multi-pack check
    const mm = s.match(multiRe)
    if (mm) {
        let qty1, qty2, unitStr
        if (mm[1] != null && mm[3] != null) { qty1 = mm[1]; qty2 = mm[2]; unitStr = mm[3] }
        else if (mm[4] != null && mm[5] != null) { qty1 = mm[4]; unitStr = mm[5]; qty2 = mm[6] }
        else if (mm[7] != null && mm[9] != null) { qty1 = mm[7]; qty2 = mm[8]; unitStr = mm[9] }
        if (qty1 && qty2 && unitStr) {
            const u = resolveUnit(unitStr)
            if (u) {
                const total = parseFloat(qty1.replace(',', '.')) * parseFloat(qty2.replace(',', '.'))
                if (total > 0) return { amount: total * u.factor, type: u.type }
            }
        }
    }

    // Simple check
    const sm = s.match(simpleRe)
    if (sm) {
        const inner = sm[1].match(new RegExp(`${NUM}\\s*${UNIT_PAT}`, 'i'))
        if (inner) {
            const u = resolveUnit(inner[2])
            if (u) {
                const val = parseFloat(inner[1].replace(',', '.'))
                if (val > 0) return { amount: val * u.factor, type: u.type }
            }
        }
    }
    return null
}

export function parseWeightOrVolume(product) {
    if (!product) return null

    // If weighable, amount is defined by unit.baseUnit
    if (isWeightProduct(product)) {
        const base = product?.unit?.baseUnit || product?.unitBase
        if (base === 'g') {
            return { amount: 1, type: 'weight', label: '\u05dc-100 \u05d2\u05e8\u05dd', isWeighablePerGram: true }
        }
        return { amount: 1000, type: 'weight', label: '\u05dc-100 \u05d2\u05e8\u05dd', isWeighablePerKg: true }
    }

    let parsed = tryParse(product.netContentText) || tryParse(product.name)
    if (!parsed || parsed.amount <= 0 || parsed.amount > 50000) return null

    const label = parsed.type === 'liquid' ? '\u05dc-100 \u05de"\u05dc' : '\u05dc-100 \u05d2\u05e8\u05dd'
    return { amount: parsed.amount, type: parsed.type, label }
}

export function getUnitPriceText(product, priceOverride) {
    if (!product) return ''

    const p = Number(priceOverride ?? product.price)
    if (!(p > 0) || !isFinite(p)) return ''

    // Weighable fresh produce/meat
    if (isWeightProduct(product)) {
        const base = product?.unit?.baseUnit || product?.unitBase
        const per100g = base === 'g' ? p * 100 : p / 10
        const rounded = round2(per100g)
        const formatted = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
        return `${formatted} \u05dc-100 \u05d2\u05e8\u05dd`
    }

    // Pack count display
    const unitAmount = product.unitAmount || product.unit?.amount || product.unit?.units
    if ((product.unitType || product.unit?.type) === 'pack' && unitAmount) {
        return `x${unitAmount}`
    }

    const parsed = parseWeightOrVolume(product)
    if (!parsed || !(parsed.amount > 0)) return ''

    const per100 = (p / parsed.amount) * 100
    if (!(per100 > 0) || !isFinite(per100)) return ''

    const rounded = round2(per100)
    const formatted = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
    return `${formatted} ${parsed.label}`
}
