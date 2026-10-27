import { selectKashrutStamps, getSupervisionLabel } from '#common/components/Kashrut/constants.js'

/**
 * Product catalog report — one row per active Comax product.
 *
 * Source of truth is the Comax collection (comax_products); Product only adds
 * the fields Comax does not carry (web name and price, kashrut, images) and
 * Gs1Product only answers "is it in GS1".
 *
 * One "האם בסניף X" column per ACTIVE store, so adding a store changes the
 * report shape — the column list is part of the row hash, so that alone
 * produces a fresh file.
 */

const YES = 'כן'
const NO = 'לא'

const BASE_COLUMNS = [
    { text: 'מחלקה עליונה', width: 22, align: 'right' },
    { text: 'מחלקה', width: 28, align: 'right' },
    { text: 'קטגוריה', width: 30, align: 'right' },
    { text: 'תת קטגוריה', width: 34, align: 'right' },
    { text: 'ברקוד', width: 14, align: 'center', asText: true },
    { text: 'שם מוצר', width: 46, align: 'right' },
    { text: 'שם ספק', width: 24, align: 'right' },
    { text: 'כשרות', width: 48, align: 'right' },
    { text: 'VAT', width: 8, align: 'center' },
    { text: 'האם ב GS1', width: 14, align: 'center' },
    { text: 'מחיר קנייה', width: 13, align: 'left', money: true },
    { text: 'מחיר מכירה', width: 13, align: 'left', money: true },
    { text: 'האם יש תמונה', width: 14, align: 'center' }
]

// Join key: Comax and Product disagree on leading zeros often enough that a
// raw string join silently drops rows.
function normBarcode(barcode) {
    const str = String(barcode ?? '').trim()
    if (!str || !/^\d+$/.test(str)) return str
    return str.replace(/^0+(?=\d)/, '')
}

// Rabbinate names (strongest first) plus the GS1 food category when present,
// e.g. 'בד"ץ העדה החרדית ירושלים (חלבי)'.
function kashrutText(kashrut) {
    const names = selectKashrutStamps(kashrut, Infinity).map(entry => entry.name).filter(Boolean)
    const kind = getSupervisionLabel(kashrut)
    if (names.length && kind) return `${names.join(', ')} (${kind})`
    if (names.length) return names.join(', ')
    return kind || ''
}

const yesNo = value => value ? YES : NO

// Empty values sort last (the old report did the same), so products with no
// category do not push the whole catalog down a screen.
function compare(a, b) {
    const x = a || '\uffff'
    const y = b || '\uffff'
    return x < y ? -1 : x > y ? 1 : 0
}

async function build(DL) {
    const [defaultDomain, stores, comax, products, gs1Barcodes] = await Promise.all([
        DL.Domain.readOne({ isDefault: true, active: true }, { _id: 0, id: 1 }),
        DL.Store.Model.find({ active: { $ne: false } }, { _id: 0, id: 1, name: 1 }).sort({ createdAt: 1 }).lean(),
        DL.ComaxProduct.Model.find(
            { active: { $ne: false }, isTrailingItem: { $ne: true } },
            {
                _id: 0, barcode: 1, name: 1, supplier: 1, price: 1, buyingPrice: 1, vat: 1,
                superDepartment: 1, department: 1, group: 1, subGroup: 1, storeIds: 1, picUrl: 1
            }
        ).lean(),
        DL.Product.Model.find(
            {},
            { _id: 0, barcode: 1, name: 1, prices: 1, kashrut: 1, 'images.product': 1, gs1SyncedAt: 1 }
        ).lean(),
        DL.Gs1Product.Model.distinct('barcode')
    ])

    const productByBarcode = new Map()
    for (const product of products) {
        if (product.barcode == null) continue
        const key = normBarcode(product.barcode)
        if (!productByBarcode.has(key)) productByBarcode.set(key, product)
    }
    const gs1Set = new Set(gs1Barcodes.map(normBarcode))

    const columns = [
        ...BASE_COLUMNS,
        ...stores.map(store => ({
            text: `האם בסניף ${store.name}`,
            width: 20,
            align: 'center'
        }))
    ]

    const rows = comax.map(item => {
        const key = normBarcode(item.barcode)
        const product = productByBarcode.get(key)
        return {
            superDepartment: item.superDepartment || '',
            department: item.department || '',
            group: item.group || '',
            subGroup: item.subGroup || '',
            barcode: String(item.barcode ?? ''),
            name: product?.name || item.name || '',
            supplier: item.supplier || '',
            kashrut: kashrutText(product?.kashrut),
            vat: item.vat === true ? 'true' : item.vat === false ? 'false' : '',
            inGs1: yesNo(gs1Set.has(key) || !!product?.gs1SyncedAt),
            buyingPrice: item.buyingPrice ?? null,
            salePrice: product?.prices?.find(price => price?.domainId === defaultDomain?.id)?.price ?? item.price ?? null,
            hasImage: yesNo((product?.images?.product || []).length > 0 || !!item.picUrl),
            stores: stores.map(store => yesNo((item.storeIds || []).includes(store.id)))
        }
    })

    rows.sort((a, b) =>
        compare(a.superDepartment, b.superDepartment) ||
        compare(a.department, b.department) ||
        compare(a.group, b.group) ||
        compare(a.subGroup, b.subGroup) ||
        compare(a.name, b.name) ||
        compare(a.barcode, b.barcode)
    )

    return {
        columns,
        rows: rows.map(row => [
            row.superDepartment,
            row.department,
            row.group,
            row.subGroup,
            row.barcode,
            row.name,
            row.supplier,
            row.kashrut,
            row.vat,
            row.inGs1,
            row.buyingPrice,
            row.salePrice,
            row.hasImage,
            ...row.stores
        ])
    }
}

export default {
    id: 'catalog',
    // File name shown on download; the date is appended when it is produced.
    fileName: 'דוח מוצרים',
    sheetName: 'דוח מוצרים',
    // Snapshot of the current catalog — there is no date to filter on.
    dateRange: false,
    build
}
