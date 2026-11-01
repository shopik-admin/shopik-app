import { getRuleMatch, normalizeRule } from '#common/functions/productRules.js'

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

    const [count, rows] = await Promise.all([
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
            .lean()
    ])

    // Name the category level that actually pulled each product into the rule.
    // Only the targets present on this page are resolved, and each distinct
    // target is read once.
    const matches = rows.map(row => ({
        id: row.id,
        name: row.name,
        barcode: row.barcode,
        match: getRuleMatch(row, normalized)
    }))
    const targets = new Set()
    for (const item of matches)
        if (item.match && item.match.level !== 'barcode') targets.add(item.match.target)

    const paths = new Map()
    for (const target of targets) {
        const category = await DL.Category.readOne({ id: target }, { _id: 0, name: 1, path: 1 })
        paths.set(target, category?.path || category?.name || target)
    }

    const products = matches.map(item => ({
        ...item,
        match: item.match
            ? { level: item.match.level, target: item.match.target, path: paths.get(item.match.target) || item.match.target }
            : null
    }))

    return { count, products, hasMore: safeSkip + matches.length < count }
}

const m_isCategory = target => String(target).includes(':')

preview.config = {
    permissions: ['setting:read']
}
