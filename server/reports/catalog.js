import { selectKashrutStamps, getSupervisionLabel, hasValidKashrut } from '#common/components/Kashrut/constants.js'
import { mapKashrut } from '#server/external/gs1/mapper.js'
import { explainStatus, STATUS_REASON } from '#server/api/comax_product/status.js'
import { isWithinWindow } from '#server/api/comax_product/salesWindow.js'
import {
    effectiveStoreIds,
    loadRuleLookup,
    pathsForComax,
    resolveRulesForComax
} from '#server/services/comaxCategorySettings/index.js'
import { shouldEnforceBuyingPrice } from '#server/api/comax_product/syncRules.js'

/**
 * Product catalog report — one row per active Comax product.
 *
 * Source of truth is the Comax collection (comax_products); Product only adds
 * the fields Comax does not carry (web name and price, kashrut, images),
 * CategoryMap answers "קטגוריה מוצגת באתר" and Gs1Product answers "is it in
 * GS1" — which needs two kinds of answer, because GS1 visibility is per
 * customer account: a doc holding a raw means we have GS1 data for the barcode,
 * a doc recorded as `no-gs1-record` means we asked and our account does not
 * carry it, and that shows as "לא (נבדק <date>)" instead of a bare "לא".
 *
 * Archived Comax products are not rows in this report. They have their own
 * export, and the backfill never stores them, so a row here is always an item
 * Comax still sells.
 *
 * A backfilled row can have no Product doc at all — the sync only creates a
 * product for an item with a buying price. For those rows the GS1 dump is the
 * only place their kashrut and media live, so they are read from it directly:
 * the team needs to see that a row has GS1 media and a valid rabbinate, because
 * that is what makes it worth adding to the delivery price list.
 *
 * "קיים באתר" and "סיבת אי הצגה באתר" are derived from the SAME status ladder
 * the nightly sync uses (explainStatus), so the report cannot tell the team a
 * product is eligible while the sync would keep it off the site. The ladder only
 * decides visibility; actually creating the Product doc still needs a buying
 * price (the sync gate).
 *
 * "סטטוס לפי כללי האתר" is the ladder's verdict itself — פעיל / מוסתר /
 * ארכיון באתר. "ארכיון באתר" is OUR archive (a missing price), which is a
 * different thing from an item Comax itself has archived: those rows are not in
 * this report at all.
 *
 * "ללא מחיר בקומקס" is that gap as a filter: Comax carries the item without a
 * selling price of its own, so there is nothing to put on the site. It is כן even
 * for a row whose site price was set by hand — that price is not Comax's.
 *
 * "מכר", "תאריך מכירה אחרונה" and the stale-sales reason make the sales window
 * visible: an item that has not sold inside its department's window loses its
 * stores and therefore drops off the site on the next import. The units are the
 * import's sum over the widest configured window; a missing value means the feed
 * never measured it, which is not the same as 0.
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
    { text: 'קטגוריה מוצגת באתר', width: 20, align: 'center' },
    { text: 'קטגוריה דורשת כשרות', width: 20, align: 'center' },
    { text: 'ברקוד', width: 14, align: 'center', asText: true },
    { text: 'שם מוצר', width: 46, align: 'right' },
    { text: 'שם ספק', width: 24, align: 'right' },
    { text: 'כשרות', width: 48, align: 'right' },
    { text: 'כשרות מתאימה', width: 15, align: 'center' },
    { text: 'VAT', width: 8, align: 'center' },
    { text: 'האם ב GS1', width: 14, align: 'center' },
    { text: 'מחיר קנייה', width: 13, align: 'left', money: true },
    { text: 'מחיר מכירה', width: 13, align: 'left', money: true },
    { text: 'ללא מחיר בקומקס', width: 16, align: 'center' },
    { text: 'האם יש תמונה', width: 14, align: 'center' },
    { text: 'מכר', width: 12, align: 'center' },
    { text: 'תאריך מכירה אחרונה', width: 16, align: 'center' },
    { text: 'קיים באתר', width: 12, align: 'center' },
    { text: 'סטטוס לפי כללי האתר', width: 18, align: 'center' },
    { text: 'סיבת אי הצגה באתר', width: 52, align: 'right', wrap: true }
]

// Hebrew labels for the ladder reasons. Kept in the report (not in status.js)
// because they are presentation, while the codes are the shared contract.
//
// Two different "archived" exist and the wording keeps them apart:
//   COMAX_ARCHIVED  — Comax itself has the item in its archive. Those rows are
//                     filtered out of this report (they have their own export),
//                     so this text is only here to complete the ladder's codes.
//   NO_PRICE / NO_BUYING_PRICE — the item is alive in Comax and only OUR ladder
//                     puts it in the site archive. Saying so is what makes the
//                     row read as "add it to the price list" instead of "dead".
const REASON_TEXT = {
    [STATUS_REASON.COMAX_ARCHIVED]: 'המוצר הועבר לארכיון בקומקס',
    [STATUS_REASON.NO_PRICE]: 'ארכיון באתר: חסר מחיר מכירה בקומקס',
    [STATUS_REASON.NO_BUYING_PRICE]: 'ארכיון באתר: חסר מחיר קנייה (לא נוסף למחירון)',
    [STATUS_REASON.NO_IMAGE]: 'חסרה תמונה',
    [STATUS_REASON.NO_STORES]: 'לא קיים באף סניף',
    [STATUS_REASON.NOT_IN_WEB]: 'לא מוצג באתר בקומקס',
    [STATUS_REASON.CATEGORY_INACTIVE]: 'הקטגוריה לא פעילה באתר',
    [STATUS_REASON.CATEGORY_SETTING_HIDDEN]: 'הקטגוריה מוסתרת בהגדרות קטגוריות קומקס',
    [STATUS_REASON.KASHRUT_MISSING]: 'חסרה כשרות מתאימה'
}

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
// 0, null and an absent field are the same answer to the reader: no price. An
// item Comax carries without an entry in 1069/255 arrives with 0 in both columns,
// and a cell reading 0 next to 'חסר מחיר' only muddles it.
const moneyOrNull = value => value > 0 ? value : null

function toDate(value) {
    if (!value) return null
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

// Display only: DD/MM/YYYY, matching the rest of the admin UI. The stored value
// is the newest sale across stores, written by the import's sales-window feed.
function formatDate(value) {
    const date = toDate(value)
    if (!date) return ''
    const pad = number => String(number).padStart(2, '0')
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

// A Comax picUrl is a source the image worker can fetch, not a stored image;
// the ladder requires images.product, so say which of the two is missing.
function reasonText(reason, item) {
    if (reason === STATUS_REASON.NO_IMAGE && item.picUrl)
        return 'תמונה טרם נטענה מקומקס'
    return REASON_TEXT[reason] || reason
}

/**
 * Why the item is outside its category's sale gate, or null when it sold inside
 * it. A disabled gate means the window does not apply. This is informational:
 * the mechanical rule that hides the product is the effective store list, but
 * the sales date is what explains it to the team.
 */
function staleSalesText(item, ruleLookup, now) {
    const rule = ruleLookup?.ruleFor?.(item)
    if (rule?.saleEnabled === false) return null
    const days = Number(rule?.saleDays) || 0
    if (!(days > 0)) return null

    const lastSale = toDate(item.lastSaleDate)
    if (!lastSale) return 'לא נמכר (אין מכירה מתועדת)'
    if (isWithinWindow(lastSale, days, now)) return null
    return `לא נמכר מאז ${formatDate(lastSale)}`
}

// Empty values sort last (the old report did the same), so products with no
// category do not push the whole catalog down a screen.
function compare(a, b) {
    const x = a || '\uffff'
    const y = b || '\uffff'
    return x < y ? -1 : x > y ? 1 : 0
}

const GS1_LOOKUP_CHUNK = 1000

/**
 * The GS1 dump behind the rows that have no Product doc.
 *
 * Only the barcode is asked for, plus the media count and the Kashrut block —
 * reading 70MB of raw JSON for a handful of columns would be absurd. Barcodes
 * are offered in every form they can be stored under (a 12-digit UPC is kept
 * 0-padded by the GS1 dump), which keeps the lookup on the unique index.
 */
async function readGs1Fallback(DL, keys) {
    const candidates = new Set()
    for (const key of keys) {
        candidates.add(key)
        if (key.length === 12) candidates.add(`0${key}`)
        else if (key.length === 13 && key[0] === '0') candidates.add(key.slice(1))
    }

    const list = [...candidates]
    const found = new Map()
    for (let i = 0; i < list.length; i += GS1_LOOKUP_CHUNK) {
        const part = list.slice(i, i + GS1_LOOKUP_CHUNK)
        const rows = await DL.Gs1Product.Model.find(
            { barcode: { $in: part }, raw: { $exists: true } },
            { _id: 0, barcode: 1, assetCount: 1, 'raw.product_info.Kashrut': 1 }
        ).lean()
        for (const row of rows || []) {
            const key = normBarcode(row.barcode)
            if (key && !found.has(key)) found.set(key, row)
        }
    }
    return found
}

// The GS1 Kashrut block is not the shape Product stores, and every renderer here
// expects the Product shape — the same mapper the enrich pipeline uses.
const gs1FallbackKashrut = row => {
    // The report's readGs1Fallback keeps the whole `raw` path; the category
    // preview's aggregation projects the block alone as `kashrut`.
    const block = row?.kashrut ?? row?.raw?.product_info?.Kashrut
    return block ? mapKashrut(block).kashrut || null : null
}

async function build(DL) {
    const [
        defaultDomain,
        stores,
        comax,
        products,
        categoryFlags,
        gs1EveryBarcode,
        gs1NoRecord,
        enforceBuyingPrice,
        ruleLookup
    ] = await Promise.all([
        DL.Domain.readOne({ isDefault: true, active: true }, { _id: 0, id: 1 }),
        DL.Store.Model.find({ active: { $ne: false } }, { _id: 0, id: 1, name: 1 }).sort({ createdAt: 1 }).lean(),
        DL.ComaxProduct.Model.find(
            { active: { $ne: false }, isTrailingItem: { $ne: true }, archived: { $ne: true } },
            {
                _id: 0, barcode: 1, name: 1, supplier: 1, price: 1, priceWithTrailing: 1, buyingPrice: 1,
                vat: 1, archived: 1, showInWeb: 1, lastSaleDate: 1, salesLastDays: 1,
                superDepartment: 1, superDepartmentCode: 1, department: 1, departmentCode: 1,
                group: 1, groupCode: 1, subGroup: 1, subGroupCode: 1, storeIds: 1, picUrl: 1
            }
        ).lean(),
        DL.Product.Model.find(
            {},
            { _id: 0, barcode: 1, scannableBarcodes: 1, name: 1, prices: 1, kashrut: 1, 'images.product': 1, gs1SyncedAt: 1 }
        ).lean(),
        DL.CategoryMap.read(
            {},
            { _id: 0, subGroupCode: 1, categoryActive: 1 },
            { limit: 0 }
        ),
        // "Has GS1 data" means a stored raw payload: a gs1_products doc is created only
        // when GS1 answered, and the skipped docs that keep a raw (out-of-stock,
        // no-product) count because GS1 does carry them. Filtering on `raw` alone has no
        // index to serve it: a COLLSCAN of all 23 449 docs (~163 MB, Atlas's top hit for
        // this collection) to build a 22 788-barcode set. The same set is the covered
        // distinct over the unique barcode index (keys only, no docs) minus the rows the
        // account holds no record for — and those are exactly the no-gs1-record rows the
        // dated answer below reads. On the prod copy: 661 of 23 449 docs, all of them
        // no-record rows, so one indexed read of 684 rows gives the difference.
        DL.Gs1Product.Model.distinct('barcode', {}),
        // Lookups that came back empty for OUR account, with the date they were
        // checked, plus any raw a later re-check stored under the same skipReason.
        // Visibility changes over time, so this is a dated answer and not a verdict.
        DL.Gs1Product.Model.find(
            { skipReason: 'no-gs1-record' },
            { _id: 0, barcode: 1, syncedAt: 1, updatedAt: 1, raw: 1 }
        ).lean(),
        shouldEnforceBuyingPrice(DL),
        // The resolved category rules explain the sale/stale result per item;
        // they are the same rules the import and sync decide with.
        loadRuleLookup(DL)
    ])

    const productByBarcode = new Map()
    const ownerByAlias = new Map()
    for (const product of products) {
        if (product.barcode == null) continue
        const key = normBarcode(product.barcode)
        if (!productByBarcode.has(key)) productByBarcode.set(key, product)
        // A scan alias has no doc of its own by design (the alias import folds
        // it into the product that owns it), so a Comax row for one describes
        // that product — not a hidden item the site forgot.
        for (const alias of product.scannableBarcodes || []) {
            const aliasKey = normBarcode(alias)
            if (aliasKey) ownerByAlias.set(aliasKey, key)
        }
    }
    const productForBarcode = key =>
        productByBarcode.get(key) || productByBarcode.get(ownerByAlias.get(key))
    const gs1Set = new Set((gs1EveryBarcode || []).map(normBarcode))
    const gs1CheckedAt = new Map()
    for (const row of gs1NoRecord || []) {
        const key = normBarcode(row.barcode)
        // A no-record row that a later re-check filled in stays a GS1 answer; the ones
        // still without a raw are the "לא" rows the barcode set must not claim.
        if (!row.raw) gs1Set.delete(key)
        gs1CheckedAt.set(key, toDate(row.updatedAt || row.syncedAt))
    }

    const docless = new Set()
    for (const item of comax) {
        const key = normBarcode(item.barcode)
        if (key && !productForBarcode(key)) docless.add(key)
    }
    const gs1Fallback = docless.size ? await readGs1Fallback(DL, docless) : new Map()

    // 'קטגוריה מוצגת באתר' and 'קטגוריה דורשת כשרות' answer the category_map
    // flags, not the status ladder: stored values grade the cell, missing flag
    // fields mean the ladder defaults (show / no kashrut requirement). A
    // sub-group with no category_map row at all is unknown — empty cell.
    const flagsBySubGroup = new Map((categoryFlags || [])
        .map(row => [String(row.subGroupCode ?? ''), row]))

    const columns = [
        ...BASE_COLUMNS,
        ...stores.map(store => ({
            text: `האם בסניף ${store.name}`,
            width: 20,
            align: 'center'
        }))
    ]

    const status = DL.Product.constants.STATUS
    // The ladder's own verdict, spelled out: 'ארכיון באתר' is the report saying
    // OUR rules archived the row, which is not the same as Comax archiving it
    // (a Comax-archived item is not a row here at all).
    const statusText = {
        [status.ACTIVE]: 'פעיל',
        [status.HIDDEN]: 'מוסתר',
        [status.ARCHIVED]: 'ארכיון באתר'
    }
    const now = new Date()

    const rows = comax.map(item => {
        const key = normBarcode(item.barcode)
        const product = productForBarcode(key)
        const subGroupCode = String(item.subGroupCode ?? '').trim()
        const flags = flagsBySubGroup.get(subGroupCode)
        const rules = ruleLookup?.ruleFor?.(item) || null
        const effectiveFlags = {
            ...(flags || {}),
            hidden: rules?.hidden === true,
            requireKashrut: rules?.requireKashrut === true
        }
        const explained = explainStatus({
            comax: item,
            existing: product,
            flags: effectiveFlags,
            status,
            enforceBuyingPrice
        })
        const existsOnSite = explained.status === status.ACTIVE
        const reasons = explained.reasons.map(reason => reasonText(reason, item))

        // A row that is already on site keeps an empty reason even if its last
        // sale is old; the date column still shows the staleness.
        if (!existsOnSite) {
            const staleSales = staleSalesText(item, ruleLookup, now)
            if (staleSales) reasons.push(staleSales)
        }

        const fallback = product ? null : gs1Fallback.get(key)
        const kashrut = product?.kashrut ?? gs1FallbackKashrut(fallback)
        const inGs1 = gs1Set.has(key) || !!product?.gs1SyncedAt
        const checkedAt = gs1CheckedAt.get(key)

        return {
            superDepartment: item.superDepartment || '',
            department: item.department || '',
            group: item.group || '',
            subGroup: item.subGroup || '',
            categoryShown: flags ? yesNo(rules?.hidden !== true) : '',
            categoryRequires: flags ? yesNo(rules?.requireKashrut === true) : '',
            barcode: String(item.barcode ?? ''),
            name: product?.name || item.name || '',
            supplier: item.supplier || '',
            kashrut: kashrutText(kashrut),
            kashrutValid: yesNo(hasValidKashrut(kashrut)),
            vat: item.vat === true ? 'true' : item.vat === false ? 'false' : '',
            // A dated check means we asked GS1 and our account does not carry
            // the barcode — a different answer from never having looked.
            inGs1: !inGs1 && checkedAt ? `${NO} (נבדק ${formatDate(checkedAt)})` : yesNo(inGs1),
            buyingPrice: moneyOrNull(item.buyingPrice),
            salePrice: moneyOrNull(product?.prices?.find(price => price?.domainId === defaultDomain?.id)?.price ?? item.price),
            // Filterable answer to "why is this row not on the site": Comax has no
            // selling price for the item at all, so nothing here can invent one. It
            // says כן even when the site shows a price of its own — that price is not
            // from Comax. The buying-price half is named in the reason column.
            noComaxPrice: yesNo(!(item.price > 0)),
            // "Is there an image" means "is there image material to load": a
            // stored product image, a Comax picUrl the image worker can fetch, or
            // GS1 media assets waiting in the dump.
            hasImage: yesNo((product?.images?.product || []).length > 0 || !!item.picUrl || (fallback?.assetCount > 0)),
            // Missing means the sales feed never measured this item — leave the
            // cell empty rather than claiming zero sales.
            unitsSold: Number.isFinite(item.salesLastDays) ? item.salesLastDays : null,
            lastSaleDate: formatDate(item.lastSaleDate),
            existsOnSite: yesNo(existsOnSite),
            siteStatus: statusText[explained.status] || explained.status,
            reason: reasons.join(' · '),
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
            row.categoryShown,
            row.categoryRequires,
            row.barcode,
            row.name,
            row.supplier,
            row.kashrut,
            row.kashrutValid,
            row.vat,
            row.inGs1,
            row.buyingPrice,
            row.salePrice,
            row.noComaxPrice,
            row.hasImage,
            row.unitsSold,
            row.lastSaleDate,
            row.existsOnSite,
            row.siteStatus,
            row.reason,
            ...row.stores
        ])
    }
}

/**
 * Scoped product preview for the Comax category settings page.
 *
 * It is the catalog report's row logic without the report's full-catalog
 * reads: only the products under the selected hierarchy node are loaded, and
 * only their barcodes are looked up in Product/GS1. The status ladder and the
 * reason strings are the same ones the nightly sync and the report use, so the
 * card answers "why is this product not on the site" with the real answer.
 */
export async function buildCategoryProducts({
    DL,
    scope = {},
    limit = 25,
    offset = 0,
    search = '',
    storeIds = [],
    minSales = null,
    maxSales = null,
    minSalePrice = null,
    maxSalePrice = null,
    minBuyingPrice = null,
    maxBuyingPrice = null,
    siteStatuses = [],
    hasImage = '',
    inGs1 = '',
    kashrutValid = '',
    sort = 'sales',
    dir = -1
}) {
    const take = Math.min(Math.max(Number(limit) || 25, 1), 100)
    const skip = Math.max(Number(offset) || 0, 0)
    const clean = value => (value == null ? '' : String(value).trim())
    const many = value => (Array.isArray(value) ? value : String(value ?? '').split(','))
        .map(clean)
        .filter(Boolean)

    const filter = {
        active: { $ne: false },
        isTrailingItem: { $ne: true },
        archived: { $ne: true }
    }

    const level = clean(scope.level)
    if (level === 'subGroup' && clean(scope.subGroupCode)) {
        filter.subGroupCode = clean(scope.subGroupCode)
    } else if (level === 'group' && clean(scope.groupCode)) {
        filter.groupCode = clean(scope.groupCode)
        if (clean(scope.departmentCode)) filter.departmentCode = clean(scope.departmentCode)
        if (clean(scope.superDepartmentCode)) filter.superDepartmentCode = clean(scope.superDepartmentCode)
    } else if (level === 'department' && clean(scope.departmentCode)) {
        filter.departmentCode = clean(scope.departmentCode)
        if (clean(scope.superDepartmentCode)) filter.superDepartmentCode = clean(scope.superDepartmentCode)
    } else if (level === 'superDepartment' && clean(scope.superDepartmentCode)) {
        filter.superDepartmentCode = clean(scope.superDepartmentCode)
    }

    const term = clean(search)
    if (term.length >= 2) {
        // Anchored on purpose: both barcode and name are indexed, and a
        // non-anchored regex would turn every search into a collection scan.
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (/^\d+$/.test(term)) filter.barcode = { $regex: `^${escaped}` }
        else filter.name = { $regex: `^${escaped}` }
    }

    // Multi-select filters are OR within the field. One value stays a scalar so
    // the query keeps the plain compound index path; more become an $in.
    const storeFilter = many(storeIds)
    if (storeFilter.length === 1) filter.storeIds = storeFilter[0]
    else if (storeFilter.length > 1) filter.storeIds = { $in: storeFilter }

    const addRange = (field, min, max) => {
        const range = {}
        const low = min === null || min === undefined || min === '' ? NaN : Number(min)
        const high = max === null || max === undefined || max === '' ? NaN : Number(max)
        if (Number.isFinite(low)) range.$gte = low
        if (Number.isFinite(high)) range.$lte = high
        if (Object.keys(range).length) filter[field] = range
    }
    addRange('salesLastDays', minSales, maxSales)
    addRange('price', minSalePrice, maxSalePrice)
    addRange('buyingPrice', minBuyingPrice, maxBuyingPrice)

    const statusFilter = many(siteStatuses)
        .filter(value => ['active', 'hidden', 'archived'].includes(value))
    if (statusFilter.length === 1) filter.siteStatus = statusFilter[0]
    else if (statusFilter.length > 1) filter.siteStatus = { $in: statusFilter }

    const parseBool = value => {
        if (value === true || value === 'true' || value === 1) return true
        if (value === false || value === 'false' || value === 0) return false
        return null
    }
    for (const [field, value] of [
        ['hasImage', hasImage],
        ['inGs1', inGs1],
        ['kashrutValid', kashrutValid]
    ]) {
        const parsed = parseBool(value)
        if (parsed !== null) filter[field] = parsed
    }

    const direction = Number(dir) === -1 ? -1 : 1
    // The barcode tie-breaker follows the primary direction on purpose: an
    // all-ascending {subGroupCode, field, barcode} index then serves both
    // directions (Mongo scans it backwards), which keeps the page stable
    // without a blocking sort. Mixed directions forced a COLLSCAN.
    const sortBy = field => ({ [field]: direction, barcode: direction })
    const sortSpec = sort === 'barcode'
        ? { barcode: direction }
        : sort === 'sales'
            ? sortBy('salesLastDays')
            : sort === 'salePrice'
                ? sortBy('price')
                : sort === 'buyingPrice'
                    ? sortBy('buyingPrice')
                    : sort === 'status'
                        ? sortBy('siteStatus')
                        : sort === 'hasImage'
                            ? sortBy('hasImage')
                            : sort === 'inGs1'
                                ? sortBy('inGs1')
                                : sort === 'kashrutValid'
                                    ? sortBy('kashrutValid')
                                    : sortBy('name')

    const projection = {
        _id: 0,
        barcode: 1,
        name: 1,
        supplier: 1,
        price: 1,
        priceWithTrailing: 1,
        buyingPrice: 1,
        vat: 1,
        archived: 1,
        showInWeb: 1,
        lastSaleDate: 1,
        salesLastDays: 1,
        superDepartment: 1,
        superDepartmentCode: 1,
        department: 1,
        departmentCode: 1,
        group: 1,
        groupCode: 1,
        subGroup: 1,
        subGroupCode: 1,
        storeIds: 1,
        picUrl: 1
    }

    const [total, items] = await Promise.all([
        DL.ComaxProduct.Model.countDocuments(filter),
        DL.ComaxProduct.Model.find(filter, projection)
            .sort(sortSpec)
            .skip(skip)
            .limit(take)
            .lean()
    ])

    if (!items?.length) {
        // Still answer the active store list: the filter dropdown must not
        // collapse just because the current search/filter returned zero rows.
        const stores = await DL.Store.Model
            .find({ active: { $ne: false } }, { _id: 0, id: 1, name: 1 })
            .sort({ createdAt: 1 })
            .lean()
            .catch(() => [])
        return {
            total: total || 0,
            limit: take,
            offset: skip,
            stores: (stores || []).map(store => ({ id: store.id, name: store.name })),
            rows: []
        }
    }

    const barcodes = [...new Set(items.map(item => clean(item.barcode)).filter(Boolean))]
    const subGroupCodes = [...new Set(items.map(item => clean(item.subGroupCode)).filter(Boolean))]
    // Only the setting rows on this page's paths: the collection grows with
    // every override and loading all of it cost ~12 ms per request.
    const settingPaths = [...new Set(items.flatMap(item => pathsForComax(item)))]

    const barcodeVariants = new Set()
    for (const barcode of barcodes) {
        barcodeVariants.add(barcode)
        if (/^\d{12}$/.test(barcode)) barcodeVariants.add(`0${barcode}`)
        else if (/^\d{13}$/.test(barcode) && barcode[0] === '0') barcodeVariants.add(barcode.slice(1))
    }

    const [defaultDomain, stores, products, categoryFlags, enforceBuyingPrice, settingRows, gs1Rows] = await Promise.all([
        DL.Domain.readOne({ isDefault: true, active: true }, { _id: 0, id: 1 }),
        DL.Store.Model.find({ active: { $ne: false } }, { _id: 0, id: 1, name: 1 }).sort({ createdAt: 1 }).lean(),
        DL.Product.Model.find(
            {
                $or: [
                    { barcode: { $in: barcodes } },
                    { scannableBarcodes: { $in: barcodes } }
                ]
            },
            {
                _id: 0,
                barcode: 1,
                scannableBarcodes: 1,
                name: 1,
                prices: 1,
                kashrut: 1,
                'images.product': 1,
                gs1SyncedAt: 1
            }
        ).lean(),
        subGroupCodes.length
            ? DL.CategoryMap.read(
                { subGroupCode: { $in: subGroupCodes } },
                { _id: 0, subGroupCode: 1, categoryActive: 1 },
                { limit: 0 }
            )
            : [],
        shouldEnforceBuyingPrice(DL),
        // Preview resolves rules for its ~25 rows, not for the whole catalog:
        // loadRuleLookup() read the map and resolved every sub-group, and a full
        // settings read was ~12 ms per request. Both were per-page work.
        settingPaths.length
            ? DL.ComaxCategorySetting.read(
                { path: { $in: settingPaths } },
                { _id: 0 },
                { limit: 0 }
            ).catch(() => [])
            : [],
        barcodeVariants.size
            ? DL.Gs1Product.Model.aggregate([
                { $match: { barcode: { $in: [...barcodeVariants] } } },
                {
                    $project: {
                        _id: 0,
                        barcode: 1,
                        skipReason: 1,
                        syncedAt: 1,
                        updatedAt: 1,
                        assetCount: 1,
                        // Projecting `raw` and a path inside it together makes
                        // MongoDB reject the projection ("path collision").
                        // The preview only needs existence plus the kashrut block.
                        hasRaw: {
                            $ne: [{ $ifNull: ['$raw', null] }, null]
                        },
                        kashrut: '$raw.product_info.Kashrut'
                    }
                }
            ])
            : []
    ])

    const settingsByPath = new Map((settingRows || []).map(row => [String(row.path), row]))
    const ruleLookup = { ruleFor: item => resolveRulesForComax(settingsByPath, item) }

    const productByBarcode = new Map()
    const ownerByAlias = new Map()
    for (const product of products || []) {
        if (product.barcode == null) continue
        const key = normBarcode(product.barcode)
        if (!productByBarcode.has(key)) productByBarcode.set(key, product)
        for (const alias of product.scannableBarcodes || []) {
            const aliasKey = normBarcode(alias)
            if (aliasKey) ownerByAlias.set(aliasKey, key)
        }
    }
    const productForBarcode = key =>
        productByBarcode.get(key) || productByBarcode.get(ownerByAlias.get(key))

    const flagsBySubGroup = new Map((categoryFlags || [])
        .map(row => [String(row.subGroupCode ?? ''), row]))

    const gs1ByKey = new Map()
    for (const row of gs1Rows || []) {
        const key = normBarcode(row.barcode)
        if (!key) continue
        const previous = gs1ByKey.get(key)
        if (!previous || (!previous.hasRaw && row.hasRaw)) gs1ByKey.set(key, row)
    }

    const status = DL.Product.constants.STATUS
    const statusText = {
        [status.ACTIVE]: 'פעיל',
        [status.HIDDEN]: 'מוסתר',
        [status.ARCHIVED]: 'ארכיון באתר'
    }
    const now = new Date()
    const activeStoreIds = (stores || []).map(store => store.id)

    const rows = (items || []).map(item => {
        const key = normBarcode(item.barcode)
        const product = productForBarcode(key)
        const subGroupCode = String(item.subGroupCode ?? '').trim()
        const rules = ruleLookup?.ruleFor?.(item) || null
        const flags = {
            ...(flagsBySubGroup.get(subGroupCode) || {}),
            hidden: rules?.hidden === true,
            requireKashrut: rules?.requireKashrut === true
        }
        // The settings page must answer the same question the sync does, so the
        // preview applies the category's sale/min-stock gates too. The report's
        // own store columns remain physical; this card's are "sellable here".
        const storeIds = effectiveStoreIds(item, rules, activeStoreIds)
        const explained = explainStatus({
            comax: storeIds ? { ...item, storeIds } : item,
            existing: product,
            flags,
            status,
            enforceBuyingPrice
        })
        const existsOnSite = explained.status === status.ACTIVE
        const reasons = explained.reasons.map(reason => reasonText(reason, item))

        if (!existsOnSite) {
            const staleSales = staleSalesText(item, ruleLookup, now)
            if (staleSales) reasons.push(staleSales)
        }

        const gs1 = gs1ByKey.get(key)
        const fallback = product ? null : gs1
        const kashrut = product?.kashrut ?? gs1FallbackKashrut(gs1)
        const inGs1 = !!gs1?.hasRaw || !!product?.gs1SyncedAt
        const checkedAt = !inGs1 && gs1?.skipReason === 'no-gs1-record'
            ? toDate(gs1.updatedAt || gs1.syncedAt)
            : null
        const salePrice = product?.prices?.find(price => price?.domainId === defaultDomain?.id)?.price ?? item.price
        const sellableStores = new Set(storeIds || [])

        return {
            barcode: String(item.barcode ?? ''),
            name: product?.name || item.name || '',
            supplier: item.supplier || '',
            status: explained.status,
            statusText: statusText[explained.status] || explained.status,
            existsOnSite,
            reason: reasons.join(' · '),
            stores: (stores || []).map(store => ({
                id: store.id,
                name: store.name,
                inStock: sellableStores.has(store.id)
            })),
            hasImage: (product?.images?.product || []).length > 0 || !!item.picUrl || (fallback?.assetCount > 0),
            inGs1,
            gs1CheckedAt: formatDate(checkedAt),
            kashrutValid: hasValidKashrut(kashrut),
            noComaxPrice: !(item.price > 0),
            unitsSold: Number.isFinite(item.salesLastDays) ? item.salesLastDays : null,
            lastSaleDate: formatDate(item.lastSaleDate),
            salePrice: moneyOrNull(salePrice),
            buyingPrice: moneyOrNull(item.buyingPrice)
        }
    })

    return {
        total: total || 0,
        limit: take,
        offset: skip,
        stores: (stores || []).map(store => ({ id: store.id, name: store.name })),
        rows
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
