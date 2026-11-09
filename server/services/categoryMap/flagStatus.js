import { hasValidKashrut } from '#common/components/Kashrut/constants.js'
import { deriveStatus } from '#server/api/comax_product/status.js'

// The un-hide pass joins every candidate to its Comax row, exactly like the
// nightly sync does, so a status is never re-derived from less information than
// the sync would have. Same batching and same knob on purpose.
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
    storeIds: 1
}

// The Comax rows the sync loop actually visits. Only the conditions the DL
// filter really keeps are mirrored (superDepartmentCode/departmentCode/groupCode
// are not filterable on comax_product, so the sync never applies them either):
// a product the sync would not activate, or that a nightly backstop would hide
// again the same night, must not be shown today.
const inSyncScope = comax =>
    comax.active !== false && comax.isTrailingItem !== true

/**
 * Apply the stored sub-group flags to the catalog in both directions:
 *
 *   hide    every ACTIVE product that violates a flag (every sub-group);
 *   unhide  every HIDDEN product of a sub-group whose flags just became
 *           permissive, re-derived through the full status ladder so nothing
 *           comes back for a reason the ladder would ignore.
 *
 * `relaxCodes` is the sub-group codes the last import relaxed. Without it the
 * sweep stays hide-only; `relaxCodes: 'all'` reconciles the whole catalog (the
 * CLI repair run). ARCHIVED products are never candidates, and a candidate with
 * no usable Comax row is left alone — only the nightly sync resurrects that.
 *
 * `updates` is returned so the caller can write a rollback file.
 */
export async function applyCategoryFlagStatuses({
    DL, dryRun = false, limit = 0, relaxCodes = null
}) {
    const status = DL.Product.constants.STATUS
    const { ACTIVE, HIDDEN } = status
    const cap = Number(limit) || 0

    const rows = await DL.CategoryMap.read(
        {},
        { _id: 0, subGroupCode: 1, showOnSite: 1, requireKashrut: 1 },
        { limit: 0 }
    )
    const flagsByCode = new Map((rows || []).map(row => [String(row.subGroupCode), row]))

    // ---- hide: every active product that violates today's flags ----
    const products = await DL.Product.Model.find(
        { status: ACTIVE },
        { _id: 0, barcode: 1, comaxSubGroupCode: 1, 'kashrut.rabbinates': 1 }
    ).lean()

    const reasons = { category: 0, kashrut: 0, both: 0 }
    const toHide = []

    for (const product of products) {
        const flags = flagsByCode.get(String(product.comaxSubGroupCode ?? ''))
        if (!flags) continue

        const byCategory = flags.showOnSite === false
        const byKashrut = flags.requireKashrut === true && !hasValidKashrut(product.kashrut)
        if (!byCategory && !byKashrut) continue

        reasons[byCategory && byKashrut ? 'both' : byCategory ? 'category' : 'kashrut'] += 1
        if (cap && toHide.length >= cap) continue
        toHide.push({
            barcode: product.barcode,
            // The constants, not the doc: the queries project the fields they
            // need, so the rollback file still records where each product came from.
            previousStatus: ACTIVE,
            status: HIDDEN
        })
    }

    // ---- unhide: hidden products of the sub-groups that just relaxed ----
    const unhide = { candidates: 0, written: 0, skipped: { noComax: 0, outOfScope: 0, ladder: 0 } }
    const toUnhide = []

    if (relaxCodes) {
        const codes = relaxCodes === 'all' ? null : (relaxCodes || []).map(String).filter(Boolean)
        if (relaxCodes === 'all' || codes.length) {
            const candidates = await DL.Product.Model.find(
                {
                    status: HIDDEN,
                    ...(codes ? { comaxSubGroupCode: { $in: codes } } : {})
                },
                { _id: 0, barcode: 1, comaxSubGroupCode: 1, 'images.product': 1, 'kashrut.rabbinates': 1 }
            ).lean()
            unhide.candidates = candidates.length

            // The same buying-price rule the sync derives statuses with.
            const enforceBuyingPrice = candidates.length
                ? await DL.ComaxProduct.count({ buyingPrice: { $gt: 0 } }) > 0
                : false

            for (let start = 0; start < candidates.length; start += BATCH) {
                const chunk = candidates.slice(start, start + BATCH)
                const comaxRows = await DL.ComaxProduct.read(
                    { barcode: { $in: chunk.map(product => product.barcode) } },
                    COMAX_SELECT,
                    { limit: 0 }
                )
                const comaxByBarcode = new Map((comaxRows || []).map(row => [String(row.barcode), row]))

                for (const product of chunk) {
                    const comax = comaxByBarcode.get(String(product.barcode))
                    if (!comax) {
                        unhide.skipped.noComax += 1
                        continue
                    }
                    if (!inSyncScope(comax)) {
                        unhide.skipped.outOfScope += 1
                        continue
                    }

                    const derived = deriveStatus({
                        comax,
                        existing: product,
                        flags: flagsByCode.get(String(product.comaxSubGroupCode ?? '')),
                        status,
                        enforceBuyingPrice
                    })
                    if (derived !== ACTIVE) {
                        unhide.skipped.ladder += 1
                        continue
                    }

                    unhide.written += 1
                    if (cap && toUnhide.length >= cap) continue
                    toUnhide.push({
                        barcode: product.barcode,
                        previousStatus: HIDDEN,
                        status: ACTIVE,
                        // Writing the stores too: hideStorelessProducts hides any
                        // ACTIVE product whose doc has no storeIds, so an
                        // un-hidden product would be hidden again tonight.
                        storeIds: Array.isArray(comax.storeIds) && comax.storeIds.length ? comax.storeIds : null
                    })
                }
            }
        }
    }

    const updates = [...toHide, ...toUnhide]

    if (!dryRun && updates.length) {
        await DL.Product.bulkWrite({
            docs: updates,
            getFilter: doc => ({ barcode: doc.barcode }),
            getUpsert: () => false,
            getUpdate: doc => ({
                $set: doc.storeIds?.length
                    ? { status: doc.status, storeIds: doc.storeIds }
                    : { status: doc.status }
            })
        })
    }

    return {
        products: products.length,
        reasons,
        hidden: toHide.length,
        unhidden: toUnhide.length,
        unhideCandidates: unhide.candidates,
        // The full impact of the un-hide pass, before any --limit cut it.
        unhideAllowed: unhide.written,
        unhideSkipped: unhide.skipped,
        toWrite: updates.length,
        updates
    }
}
