import { hasValidKashrut } from '#common/components/Kashrut/constants.js'
import { mapKashrut } from '#server/external/gs1/mapper.js'
import { deriveStatus } from '#server/api/comax_product/status.js'
import { loadCategoryLookup } from '#server/services/categoryMap/index.js'
import { shouldEnforceBuyingPrice } from '#server/api/comax_product/syncRules.js'
import {
    effectiveStoreIds,
    loadRuleLookup,
    readActiveStoreIds
} from './index.js'

export function normBarcode(barcode) {
    const str = String(barcode ?? '').trim()
    if (!str || !/^\d+$/.test(str)) return str
    return str.replace(/^0+(?=\d)/, '')
}

function variantsOf(barcodes) {
    const variants = new Set()
    for (const barcode of barcodes || []) {
        const key = normBarcode(barcode)
        if (!key) continue
        variants.add(key)
        if (key.length === 12) variants.add(`0${key}`)
        else if (key.length === 13 && key[0] === '0') variants.add(key.slice(1))
    }
    return [...variants]
}

/**
 * GS1 flags for a page of barcodes: hasRaw / assetCount / kashrut block.
 * The aggregation projects the kashrut block separately because projecting
 * `raw` and `raw.product_info.Kashrut` together is a path collision.
 */
export async function loadGs1Flags(DL, barcodes) {
    if (typeof DL?.Gs1Product?.Model?.aggregate !== 'function') return new Map()
    const variants = variantsOf(barcodes)
    if (!variants.length) return new Map()

    let rows
    try {
        rows = await DL.Gs1Product.Model.aggregate([
            { $match: { barcode: { $in: variants } } },
            {
                $project: {
                    _id: 0,
                    barcode: 1,
                    assetCount: 1,
                    hasRaw: { $ne: [{ $ifNull: ['$raw', null] }, null] },
                    kashrut: '$raw.product_info.Kashrut'
                }
            }
        ])
    } catch (e) {
        console.warn('[Comax Preview] GS1 flag lookup failed:', e?.message || e)
        return new Map()
    }

    const byKey = new Map()
    for (const row of rows || []) {
        const key = normBarcode(row.barcode)
        if (!key) continue
        const previous = byKey.get(key)
        if (!previous || (!previous.hasRaw && row.hasRaw)) byKey.set(key, row)
    }
    return byKey
}

const gs1Kashrut = row => row?.kashrut ? mapKashrut(row.kashrut).kashrut || null : null

/**
 * The four flags the category product table uses. `categoryLookup` and `rules`
 * are optional so the backfill/sync can pass their already-loaded lookups.
 */
export function computePreviewFlags({
    comax,
    product,
    gs1 = null,
    categoryLookup = null,
    rules = null,
    status = null,
    enforceBuyingPrice = false,
    activeStoreIds = []
}) {
    const subGroupCode = comax?.subGroupCode == null ? null : String(comax.subGroupCode)
    const categoryFlags = subGroupCode ? categoryLookup?.flagsByCode?.get(subGroupCode) : null
    const flags = {
        ...(categoryFlags || {}),
        hidden: rules?.hidden === true,
        requireKashrut: rules?.requireKashrut === true
    }
    const storeIds = effectiveStoreIds(comax, rules, activeStoreIds)
    const siteStatus = deriveStatus({
        comax: storeIds ? { ...comax, storeIds } : comax,
        existing: product,
        flags,
        status,
        enforceBuyingPrice
    })
    const kashrut = product?.kashrut ?? gs1Kashrut(gs1)

    return {
        siteStatus,
        hasImage: (product?.images?.product || []).length > 0 ||
            !!comax?.picUrl ||
            (!product && gs1?.assetCount > 0),
        inGs1: !!gs1?.hasRaw || !!product?.gs1SyncedAt,
        kashrutValid: hasValidKashrut(kashrut)
    }
}

/**
 * One-off backfill for the denormalised preview flags. The nightly sync writes
 * them for the rows it visits; this fills rows that have not been through a
 * sync since the fields were introduced.
 */
export async function backfillPreviewFlags({ DL, batchSize = 1000 } = {}) {
    const BATCH = Number(batchSize) || 1000
    const [categoryLookup, ruleLookup, activeStoreIds, enforceBuyingPrice] = await Promise.all([
        loadCategoryLookup(DL),
        loadRuleLookup(DL),
        readActiveStoreIds(DL),
        shouldEnforceBuyingPrice(DL)
    ])
    const status = DL.Product.constants.STATUS

    let afterBarcode = null
    let scanned = 0
    let updated = 0

    while (true) {
        const filter = afterBarcode ? { barcode: { $gt: afterBarcode } } : {}
        const comaxRows = await DL.ComaxProduct.Model.find(
            filter,
            {
                _id: 0,
                barcode: 1,
                price: 1,
                priceWithTrailing: 1,
                buyingPrice: 1,
                archived: 1,
                showInWeb: 1,
                storeIds: 1,
                stockByStore: 1,
                saleStoreIds: 1,
                saleCheckedStores: 1,
                superDepartmentCode: 1,
                departmentCode: 1,
                groupCode: 1,
                subGroupCode: 1,
                picUrl: 1
            }
        ).sort({ barcode: 1 }).limit(BATCH).lean()

        if (!comaxRows?.length) break
        afterBarcode = comaxRows[comaxRows.length - 1].barcode

        const barcodes = comaxRows.map(row => row.barcode).filter(Boolean)
        const [products, gs1ByKey] = await Promise.all([
            DL.Product.Model.find(
                { barcode: { $in: barcodes } },
                {
                    _id: 0,
                    barcode: 1,
                    prices: 1,
                    kashrut: 1,
                    'images.product': 1,
                    gs1SyncedAt: 1
                }
            ).lean(),
            loadGs1Flags(DL, barcodes)
        ])
        const productByBarcode = new Map((products || []).map(product => [String(product.barcode), product]))

        const updates = comaxRows.map(row => {
            const product = productByBarcode.get(String(row.barcode)) || null
            const rules = ruleLookup.ruleFor(row)
            return {
                barcode: row.barcode,
                ...computePreviewFlags({
                    comax: row,
                    product,
                    gs1: gs1ByKey.get(normBarcode(row.barcode)),
                    categoryLookup,
                    rules,
                    status,
                    enforceBuyingPrice,
                    activeStoreIds
                })
            }
        })

        if (updates.length) {
            await DL.ComaxProduct.Model.bulkWrite(updates.map(doc => ({
                updateOne: {
                    filter: { barcode: doc.barcode },
                    update: {
                        $set: {
                            siteStatus: doc.siteStatus,
                            hasImage: doc.hasImage,
                            inGs1: doc.inGs1,
                            kashrutValid: doc.kashrutValid
                        }
                    }
                }
            })), { ordered: false })
        }

        scanned += comaxRows.length
        updated += updates.length
        if (comaxRows.length < BATCH) break
    }

    return { scanned, updated }
}

export default {
    normBarcode,
    loadGs1Flags,
    computePreviewFlags,
    backfillPreviewFlags
}
