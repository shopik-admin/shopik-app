import { normalizeRule } from '#common/functions/productRules.js'

const DEFAULT_LIMIT = 60
const MAX_LIMIT = 300

// Which active products a rule would touch — lets an admin sanity-check a cap
// ("5 packs from this group") before saving it. Read-only, paginated: a rule
// can target a whole department, so the grid loads a page at a time.
function buildFilter(rule, status) {
    const or = []
    if (rule.categoryIds.length)
        or.push({ 'category.pathIds': { $in: rule.categoryIds } })
    if (rule.barcodes.length)
        or.push({ barcode: { $in: rule.barcodes } })
    if (!or.length) return null

    const filter = { status }
    if (rule.excludeBarcodes.length)
        filter.barcode = { $nin: rule.excludeBarcodes }
    if (or.length === 1)
        Object.assign(filter, or[0])
    else
        filter.$or = or
    return filter
}

export default async function preview({ rule, skip = 0, limit = DEFAULT_LIMIT } = {}, { DL }) {
    const normalized = normalizeRule(rule || {}, 0)
    const filter = buildFilter(normalized, DL.Product.constants.STATUS.ACTIVE)
    if (!filter) return { count: 0, products: [], hasMore: false }

    const safeSkip = Math.max(0, Number(skip) || 0)
    const safeLimit = Math.min(Math.max(1, Number(limit) || DEFAULT_LIMIT), MAX_LIMIT)

    const [count, products] = await Promise.all([
        DL.Product.Model.countDocuments(filter),
        DL.Product.Model.find(filter, {
            _id: 0,
            id: 1,
            name: 1,
            barcode: 1,
            'category.title': 1
        })
            // Unique tiebreaker: name alone repeats, and skip/limit pages of
            // ties would otherwise overlap.
            .sort({ name: 1, id: 1 })
            .skip(safeSkip)
            .limit(safeLimit)
            .lean()
    ])

    return { count, products, hasMore: safeSkip + products.length < count }
}

preview.config = {
    permissions: ['setting:read']
}
