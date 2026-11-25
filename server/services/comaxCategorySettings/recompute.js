import { deriveStatus } from '#server/api/comax_product/status.js'
import { shouldEnforceBuyingPrice } from '#server/api/comax_product/syncRules.js'
import { loadCategoryLookup } from '#server/services/categoryMap/index.js'
import { invalidateMenu } from '#server/utils/data/getMenu.js'
import { scanDel } from '#server/utils/data/displayBlocks.js'
import {
    effectiveStoreIds,
    loadRuleLookup,
    pathsForComax,
    readActiveStoreIds
} from './index.js'
import {
    computePreviewFlags,
    loadGs1Flags,
    normBarcode
} from './preview.js'

const BATCH = Number(process.env.COMAX_SYNC_BATCH || 1000)

const COMAX_SELECT = {
    _id: 0,
    barcode: 1,
    active: 1,
    isTrailingItem: 1,
    archived: 1,
    price: 1,
    priceWithTrailing: 1,
    buyingPrice: 1,
    showInWeb: 1,
    storeIds: 1,
    stockByStore: 1,
    saleStoreIds: 1,
    saleCheckedStores: 1,
    superDepartmentCode: 1,
    departmentCode: 1,
    groupCode: 1,
    subGroupCode: 1
}

const sameStores = (a, b) => {
    const left = [...new Set(a || [])].sort()
    const right = [...new Set(b || [])].sort()
    return left.length === right.length && left.every((id, index) => id === right[index])
}

/**
 * Every sub-group code whose hierarchy contains `path`.
 *
 * A null result means "the whole catalog" (global). Codes that only exist in
 * comax_products (a sub-group the map has not met yet) are included too, so a
 * setting on a parent node covers a brand-new Comax category on the next save.
 */
export async function codesUnderPath(DL, path) {
    if (!path || path === 'global') return null

    const codes = new Set()
    const maps = DL?.CategoryMap?.read
        ? await DL.CategoryMap.read(
            {},
            {
                _id: 0,
                subGroupCode: 1,
                superDepartmentCode: 1,
                departmentCode: 1,
                groupCode: 1
            },
            { limit: 0 }
        )
        : []
    for (const row of maps || []) {
        if (row?.subGroupCode == null) continue
        if (pathsForComax(row).includes(path)) codes.add(String(row.subGroupCode))
    }

    if (DL?.ComaxProduct?.Model?.aggregate) {
        const rows = await DL.ComaxProduct.Model.aggregate([
            { $match: { subGroupCode: { $nin: [null, ''] } } },
            {
                $group: {
                    _id: {
                        super: '$superDepartmentCode',
                        department: '$departmentCode',
                        group: '$groupCode',
                        subGroup: '$subGroupCode'
                    }
                }
            }
        ])
        for (const row of rows || []) {
            const codesForRow = {
                superDepartmentCode: row?._id?.super,
                departmentCode: row?._id?.department,
                groupCode: row?._id?.group,
                subGroupCode: row?._id?.subGroup
            }
            if (pathsForComax(codesForRow).includes(path))
                codes.add(String(codesForRow.subGroupCode))
        }
    }

    return [...codes]
}

/**
 * Re-derive status and the effective store list for the products under a
 * category path. Used after a settings save so a hide or a minimum-stock change
 * is visible immediately instead of on the next nightly sync.
 *
 * Sale-window edits can only be as fresh as the stored sale data: a wider
 * window is applied on the next import, when Comax answers the dates again.
 */
export async function recomputeCategoryProducts({ DL, path = 'global', codes = null, dryRun = false } = {}) {
    const targetCodes = codes || await codesUnderPath(DL, path)
    const scope = {
        status: { $in: [DL.Product.constants.STATUS.ACTIVE, DL.Product.constants.STATUS.HIDDEN] },
        ...(targetCodes === null ? {} : { comaxSubGroupCode: { $in: targetCodes } })
    }

    const [ruleLookup, categoryLookup, activeStoreIds] = await Promise.all([
        loadRuleLookup(DL),
        loadCategoryLookup(DL),
        readActiveStoreIds(DL)
    ])
    const enforceBuyingPrice = await shouldEnforceBuyingPrice(DL)
    const statuses = DL.Product.constants.STATUS

    let afterBarcode = null
    const counts = { products: 0, updated: 0, hidden: 0, unhidden: 0, stockChanged: 0 }

    while (true) {
        const filter = {
            ...scope,
            ...(afterBarcode ? { barcode: { $gt: afterBarcode } } : {})
        }
        const products = await DL.Product.Model.find(
            filter,
            {
                _id: 0,
                barcode: 1,
                status: 1,
                storeIds: 1,
                comaxSubGroupCode: 1,
                'images.product': 1,
                'kashrut.rabbinates': 1
            }
        ).sort({ barcode: 1 }).limit(BATCH).lean()

        if (!products?.length) break
        afterBarcode = products[products.length - 1].barcode

        const barcodes = products.map(product => product.barcode).filter(Boolean)
        const comaxRows = barcodes.length
            ? await DL.ComaxProduct.read({ barcode: { $in: barcodes } }, COMAX_SELECT, { limit: 0 })
            : []
        const comaxByBarcode = new Map((comaxRows || []).map(row => [String(row.barcode), row]))
        const gs1ByKey = await loadGs1Flags(DL, barcodes)

        const updates = []
        const comaxUpdates = []
        for (const product of products) {
            const comax = comaxByBarcode.get(String(product.barcode))
            if (!comax) continue
            // Keep the sync's scope: a settings save must never resurrect an
            // inactive/trailing Comax row or invent a product the sync skips.
            if (comax.active === false || comax.isTrailingItem === true) continue
            if (String(comax.superDepartmentCode ?? '') === '12') continue

            const rules = ruleLookup.ruleFor(comax)
            const storeIds = effectiveStoreIds(comax, rules, activeStoreIds)
            const flags = {
                ...(categoryLookup.flagsByCode.get(String(product.comaxSubGroupCode ?? '')) || {}),
                hidden: rules.hidden,
                requireKashrut: rules.requireKashrut
            }
            const derived = deriveStatus({
                comax: storeIds ? { ...comax, storeIds } : comax,
                existing: product,
                flags,
                status: statuses,
                enforceBuyingPrice
            })

            comaxUpdates.push({
                barcode: comax.barcode,
                ...computePreviewFlags({
                    comax,
                    product,
                    gs1: gs1ByKey.get(normBarcode(comax.barcode)),
                    categoryLookup,
                    rules,
                    status: statuses,
                    enforceBuyingPrice,
                    activeStoreIds
                })
            })

            const stockChanged = Array.isArray(storeIds) && !sameStores(storeIds, product.storeIds)
            if (derived === product.status && !stockChanged) continue

            counts.updated += 1
            if (product.status === statuses.ACTIVE && derived === statuses.HIDDEN) counts.hidden += 1
            if (product.status === statuses.HIDDEN && derived === statuses.ACTIVE) counts.unhidden += 1
            if (stockChanged) counts.stockChanged += 1

            updates.push({
                barcode: product.barcode,
                status: derived,
                ...(Array.isArray(storeIds) ? { storeIds } : {})
            })
        }

        if (!dryRun && updates.length) {
            await DL.Product.bulkWrite({
                docs: updates,
                getFilter: doc => ({ barcode: doc.barcode }),
                getUpsert: () => false,
                getUpdate: doc => ({
                    $set: Array.isArray(doc.storeIds)
                        ? { status: doc.status, storeIds: doc.storeIds }
                        : { status: doc.status }
                })
            })
        }

        if (!dryRun && comaxUpdates.length && typeof DL.ComaxProduct.Model?.bulkWrite === 'function') {
            await DL.ComaxProduct.Model.bulkWrite(comaxUpdates.map(doc => ({
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

        counts.products += products.length
        if (products.length < BATCH) break
    }

    if (!dryRun && counts.updated) {
        await invalidateMenu({ DL })
        if (DL.redis) await scanDel(DL.redis, 'display:*')
    }

    return { ...counts, codes: targetCodes === null ? null : targetCodes.length }
}

export default recomputeCategoryProducts
