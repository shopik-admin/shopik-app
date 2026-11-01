import { getRuleMatch, normalizeRule } from '#common/functions/productRules.js'

const DEFAULT_LIMIT = 60
const MAX_LIMIT = 300
const BARCODE_TARGET = 'barcode'

// Which active products a rule would touch — lets an admin sanity-check a cap
// ("5 packs from this group") before saving it. Read-only, paginated: a rule
// can target a whole department, so the grid loads a page at a time.
function buildFilter(rule, status) {
    const and = []

    if (rule.categoryIds.length && rule.barcodes.length) {
        and.push({
            $or: [
                { 'category.pathIds': { $in: rule.categoryIds } },
                { barcode: { $in: rule.barcodes } }
            ]
        })
    } else if (rule.categoryIds.length) {
        and.push({ 'category.pathIds': { $in: rule.categoryIds } })
    } else if (rule.barcodes.length) {
        and.push({ barcode: { $in: rule.barcodes } })
    } else return null

    // Exclusions win over every target, so they stay a condition of their own
    // instead of being merged into the $in on the same field.
    if (rule.excludeBarcodes.length)
        and.push({ barcode: { $nin: rule.excludeBarcodes } })

    const filter = { status }
    if (and.length === 1) Object.assign(filter, and[0])
    else filter.$and = and
    return filter
}

// Same base filter narrowed by the picker: a category, or the rule's barcodes.
function narrowFilter(baseFilter, target, barcodes) {
    if (!target) return baseFilter
    if (target === BARCODE_TARGET && !barcodes.length) return baseFilter
    const clause = target === BARCODE_TARGET
        ? { barcode: { $in: barcodes } }
        : { 'category.pathIds': target }
    return { $and: [baseFilter, clause] }
}

// Counts per rule target, always for the whole rule so the picker keeps its
// numbers while one of them is selected. A product is counted under every rule
// category it belongs to; the card itself shows its most specific match.
async function buildBreakdown(DL, baseFilter, rule) {
    const rows = []

    if (rule.categoryIds.length) {
        const grouped = await DL.Product.Model.aggregate([
            { $match: baseFilter },
            {
                $project: {
                    targets: {
                        $filter: {
                            input: { $ifNull: ['$category.pathIds', []] },
                            as: 'id',
                            cond: { $in: ['$$id', rule.categoryIds] }
                        }
                    }
                }
            },
            { $unwind: '$targets' },
            { $group: { _id: '$targets', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } }
        ])
        rows.push(...grouped.map(row => ({ target: row._id, count: row.count })))
    }

    if (rule.barcodes.length) {
        const filter = { $and: [baseFilter, { barcode: { $in: rule.barcodes } }] }
        rows.push({ target: BARCODE_TARGET, count: await DL.Product.Model.countDocuments(filter) })
    }

    return rows.filter(row => row.count > 0)
}

export default async function preview({ rule, skip = 0, limit = DEFAULT_LIMIT, category = '' } = {}, { DL }) {
    const normalized = normalizeRule(rule || {}, 0)
    const baseFilter = buildFilter(normalized, DL.Product.constants.STATUS.ACTIVE)
    if (!baseFilter) return { count: 0, products: [], hasMore: false, breakdown: [] }

    const filter = narrowFilter(baseFilter, category, normalized.barcodes)

    const safeSkip = Math.max(0, Number(skip) || 0)
    const safeLimit = Math.min(Math.max(1, Number(limit) || DEFAULT_LIMIT), MAX_LIMIT)

    const [count, rows, breakdown] = await Promise.all([
        DL.Product.Model.countDocuments(filter),
        DL.Product.Model.find(filter, {
            _id: 0,
            id: 1,
            name: 1,
            barcode: 1,
            // pathIds is what the rule matches on, so the answer needs it too
            category: 1
        })
            // Unique tiebreaker: name alone repeats, and skip/limit pages of
            // ties would otherwise overlap.
            .sort({ name: 1, id: 1 })
            .skip(safeSkip)
            .limit(safeLimit)
            .lean(),
        buildBreakdown(DL, baseFilter, normalized)
    ])

    // Display name for every target shown: the picker options and the matches
    // on this page, one read per distinct target.
    const targets = new Set(breakdown.map(row => row.target))
    for (const row of rows) {
        const match = getRuleMatch(row, normalized)
        if (match) targets.add(match.target)
    }
    targets.delete(BARCODE_TARGET)

    const categories = new Map()
    for (const target of targets) {
        const doc = await DL.Category.readOne({ id: target }, { _id: 0, name: 1, path: 1 })
        categories.set(target, { name: doc?.name || target, path: doc?.path || target })
    }

    const products = rows.map(row => {
        const match = getRuleMatch(row, normalized)
        const info = match ? categories.get(match.target) : null
        return {
            id: row.id,
            name: row.name,
            barcode: row.barcode,
            match: match
                ? { level: match.level, target: match.target, name: info?.name || match.target, path: info?.path || match.target }
                : null
        }
    })

    return {
        count,
        products,
        hasMore: safeSkip + products.length < count,
        breakdown: breakdown.map(row => ({
            target: row.target,
            count: row.count,
            name: row.target === BARCODE_TARGET ? '' : (categories.get(row.target)?.name || row.target),
            path: row.target === BARCODE_TARGET ? '' : (categories.get(row.target)?.path || row.target)
        }))
    }
}

preview.config = {
    permissions: ['setting:read']
}
