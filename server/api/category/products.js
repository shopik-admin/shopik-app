const DEFAULT_LIMIT = 60
const MAX_LIMIT = 200

/**
 * The ACTIVE products of one Comax sub-group, for the admin preview of a
 * mapping. Hidden/archived products are left out because the storefront never
 * shows them either, so the preview is exactly what the mapping covers.
 *
 * Only id/name/barcode: the product image is derived from the id
 * (common/functions/productImageUrl.js), so no files are transferred here.
 */
export default async function subGroupProducts({ subGroupCode, limit = DEFAULT_LIMIT }, { DL }) {
    const code = String(subGroupCode ?? '').trim()
    if (!code) throw { status: 400, message: 'subGroupCode required' }

    const shown = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT)
    const filter = {
        comaxSubGroupCode: code,
        status: DL.Product.constants.STATUS.ACTIVE
    }

    const [products, total] = await Promise.all([
        DL.Product.read(filter, { _id: 0, id: 1, name: 1, barcode: 1 }, { limit: shown }),
        DL.Product.Model.countDocuments(filter)
    ])

    return {
        subGroupCode: code,
        total: total || 0,
        shown: products?.length || 0,
        products: products || []
    }
}

subGroupProducts.config = {
    required: ['subGroupCode'],
    // Previewing the products of a sub-group is part of reading the coverage.
    permissions: ['category:read']
}
