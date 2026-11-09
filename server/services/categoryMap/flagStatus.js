import { hasValidKashrut } from '#common/components/Kashrut/constants.js'

/**
 * Lower ACTIVE products whose sub-group flags hide them. Hide-only: this never
 * sets a product back to ACTIVE, and ARCHIVED products are not touched. The
 * nightly sync owns un-hiding (it re-derives the full ladder).
 *
 * `updates` is returned so the caller can write a rollback file.
 */
export async function applyCategoryFlagStatuses({ DL, dryRun = false, limit = 0 }) {
    const { ACTIVE, HIDDEN } = DL.Product.constants.STATUS

    const rows = await DL.CategoryMap.read(
        {},
        { _id: 0, subGroupCode: 1, showOnSite: 1, requireKashrut: 1 },
        { limit: 0 }
    )
    const flagsByCode = new Map((rows || []).map(row => [String(row.subGroupCode), row]))

    const products = await DL.Product.Model.find(
        { status: ACTIVE },
        { _id: 0, barcode: 1, comaxSubGroupCode: 1, 'kashrut.rabbinates': 1 }
    ).lean()

    const reasons = { category: 0, kashrut: 0, both: 0 }
    const updates = []
    const cap = Number(limit) || 0

    for (const product of products) {
        const flags = flagsByCode.get(String(product.comaxSubGroupCode ?? ''))
        if (!flags) continue

        const byCategory = flags.showOnSite === false
        const byKashrut = flags.requireKashrut === true && !hasValidKashrut(product.kashrut)
        if (!byCategory && !byKashrut) continue

        reasons[byCategory && byKashrut ? 'both' : byCategory ? 'category' : 'kashrut'] += 1
        if (cap && updates.length >= cap) continue
        updates.push({
            barcode: product.barcode,
            previousStatus: product.status,
            status: HIDDEN
        })
    }

    if (!dryRun && updates.length) {
        await DL.Product.bulkWrite({
            docs: updates,
            getFilter: doc => ({ barcode: doc.barcode }),
            getUpsert: () => false,
            getUpdate: doc => ({ $set: { status: doc.status } })
        })
    }

    return {
        products: products.length,
        reasons,
        toWrite: updates.length,
        updates
    }
}
