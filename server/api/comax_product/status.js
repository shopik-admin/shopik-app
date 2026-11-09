import { hasValidKashrut } from '#common/components/Kashrut/constants.js'

// What the customer pays: the Comax price plus the deposit (trailing item)
// when the import resolved one. priceWithTrailing is written by the import;
// older rows without it fall back to the plain Comax price.
export function retailPrice(comax) {
    if (!(comax.price > 0)) return comax.price
    const withTrailing = Number(comax.priceWithTrailing)
    return Number.isFinite(withTrailing) && withTrailing > 0 ? withTrailing : comax.price
}

/**
 * The single product-status ladder. Shared by the nightly Comax sync and the
 * category-flag sweeps so a product can never be un-hidden by a rule that does
 * not know why it was hidden.
 *
 *   archived / no price                    -> archived (never resurrected)
 *   no image / in stock nowhere            -> hidden
 *   comax showInWeb off                    -> hidden
 *   sub-group showOnSite false             -> hidden
 *   sub-group requires kashrut, no valid   -> hidden
 *   otherwise                              -> active
 *
 * `flags` is the product's category_map row ({ showOnSite, requireKashrut });
 * missing flags mean show + no kashrut requirement.
 */
export function deriveStatus({ comax, existing, flags, status, enforceBuyingPrice = false }) {
    if (comax.archived) return status.ARCHIVED

    const price = retailPrice(comax)
    if (!(price > 0) || (enforceBuyingPrice && !(comax.buyingPrice > 0)))
        return status.ARCHIVED

    if (!(existing?.images?.product || []).length) return status.HIDDEN
    // A MISSING storeIds means it was never tracked and must not hide anything.
    if (Array.isArray(comax.storeIds) && comax.storeIds.length === 0) return status.HIDDEN
    if (!comax.showInWeb) return status.HIDDEN

    if (flags?.showOnSite === false) return status.HIDDEN
    if (flags?.requireKashrut === true && !hasValidKashrut(existing?.kashrut))
        return status.HIDDEN

    return status.ACTIVE
}
