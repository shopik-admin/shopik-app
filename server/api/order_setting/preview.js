import { normalizeRule } from '#common/functions/productRules.js'

// How many active products a rule would touch — lets an admin sanity-check a
// cap ("5 packs from this group") before saving it. Read-only.
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

export default async function preview({ rule } = {}, { DL }) {
    const normalized = normalizeRule(rule || {}, 0)
    const filter = buildFilter(normalized, DL.Product.constants.STATUS.ACTIVE)
    if (!filter) return { count: 0, sample: [] }

    const [count, sample] = await Promise.all([
        DL.Product.Model.countDocuments(filter),
        DL.Product.Model.find(filter, {
            _id: 0,
            id: 1,
            name: 1,
            barcode: 1,
            'category.title': 1
        }).limit(20).lean()
    ])

    return { count, sample }
}

preview.config = {
    permissions: ['setting:read']
}
