import { buildCategoryPlan } from './parse.js'
import { productCategoryFor } from './lookup.js'
import { COMAX_META_FIELDS, metaFromComax } from './metadata.js'
import { invalidateMenu } from '#server/utils/data/getMenu.js'

const BATCH = 1000

async function applyCategories(DL, plan) {
    const existing = await DL.Category.read(
        {},
        { _id: 0, id: 1, icon: 1, sortOrder: 1, active: 1 },
        { limit: 0 }
    )
    const existingById = new Map((existing || []).map(category => [category.id, category]))

    // Manual icon/order/active survive a re-import; the tree itself is fully
    // replaced by the CSV.
    const docs = plan.categories.map(node => {
        const previous = existingById.get(node.id)
        const doc = { ...node }
        if (previous) {
            if ('icon' in previous) doc.icon = previous.icon
            if (Number.isFinite(previous.sortOrder)) doc.sortOrder = previous.sortOrder
            if (typeof previous.active === 'boolean') doc.active = previous.active
        }
        return doc
    })

    await DL.Category.bulkWrite({
        docs,
        getFilter: doc => ({ id: doc.id }),
        getUpsert: () => true
    })

    const keepIds = docs.map(doc => doc.id)
    const staleIds = await DL.Category.Model.distinct('id', { id: { $nin: keepIds } })
    if (staleIds.length) {
        await DL.Category.Model.deleteMany({ id: { $in: staleIds } })
        await DL.Category.cache?.del(staleIds)
    }

    return {
        total: docs.length,
        removed: staleIds.length
    }
}

async function backfillProducts(DL, plan) {
    const lookup = {
        hasMap: true,
        mapByCode: new Map(plan.map.map(row => [row.subGroupCode, row.categoryId])),
        categoriesById: new Map(plan.categories.map(category => [category.id, category]))
    }

    const metaByCode = new Map()
    let updated = 0
    let skip = 0

    while (true) {
        const batch = await DL.ComaxProduct.read(
            {},
            { _id: 0, barcode: 1, subGroupCode: 1, ...COMAX_META_FIELDS },
            { limit: BATCH, skip, sort: { barcode: 1 } }
        )
        if (!batch?.length) break

        const ops = batch.map(comax => {
            const code = comax.subGroupCode == null ? null : String(comax.subGroupCode)
            if (code && !metaByCode.has(code)) metaByCode.set(code, metaFromComax(comax))

            const category = productCategoryFor(code, lookup)
            const update = { $set: { comaxSubGroupCode: code } }
            if (category) update.$set.category = category
            else update.$unset = { category: '' }

            return { updateOne: { filter: { barcode: comax.barcode }, update } }
        })

        if (ops.length) {
            const result = await DL.Product.Model.bulkWrite(ops, { ordered: false })
            updated += result?.modifiedCount || 0
        }

        skip += batch.length
        if (batch.length < BATCH) break
    }

    return { updated, metaByCode }
}

async function applyMap(DL, plan, activeCodes, metaByCode) {
    const docs = plan.map.map(row => ({ ...row }))
    const keep = new Set(docs.map(row => row.subGroupCode))

    // Every active-product sub-group must exist in the map. Codes the CSV did
    // not mention stay unassigned (categoryId: null) and show up in the admin.
    for (const code of activeCodes) {
        if (keep.has(code)) continue
        docs.push({
            subGroupCode: code,
            categoryId: null,
            ...(metaByCode.get(code) || {})
        })
        keep.add(code)
    }

    await DL.CategoryMap.bulkWrite({
        docs,
        getFilter: doc => ({ subGroupCode: doc.subGroupCode }),
        getUpsert: () => true
    })

    const stale = await DL.CategoryMap.Model.distinct(
        'subGroupCode',
        { subGroupCode: { $nin: [...keep] } }
    )
    if (stale.length)
        await DL.CategoryMap.Model.deleteMany({ subGroupCode: { $in: stale } })

    return {
        total: docs.length,
        unassigned: docs.filter(row => !row.categoryId).length,
        removed: stale.length
    }
}

/**
 * Replace the whole category tree + sub-group map from a CSV, then re-point
 * every product at the new categories. `productsUpdated` counts modified
 * product rows (not the catalog size).
 */
export async function applyCategoryMap({ DL, csvText, filename }) {
    const plan = buildCategoryPlan(csvText)

    // Create the tree first so the product backfill never points at a category
    // that does not exist yet.
    const categories = await applyCategories(DL, plan)
    const products = await backfillProducts(DL, plan)

    const activeCodes = (await DL.Product.Model.distinct(
        'comaxSubGroupCode',
        { status: DL.Product.constants.STATUS.ACTIVE }
    ))
        .filter(code => code != null && String(code).trim() !== '')
        .map(String)

    const map = await applyMap(DL, plan, activeCodes, products.metaByCode)
    await invalidateMenu({ DL })

    return {
        filename: filename || null,
        categories: categories.total,
        removedCategories: categories.removed,
        level1: plan.counts.l1,
        level2: plan.counts.l2,
        level3: plan.counts.l3,
        map: map.total,
        unassigned: map.unassigned,
        removedMap: map.removed,
        productsUpdated: products.updated
    }
}
