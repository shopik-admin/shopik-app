import buildOpsFilter from '#server/utils/data/opsFilter.js'

export default async function count(payload, { DL, _admin }) {
    // Same queue scoping as list.js (shared builder), without pagination.
    // NOTE: base status stays `{ $ne: 'cart' }` (not list's $in) to preserve
    // the classic total behavior when no extraFilter is passed.
    const { filter: extraFilter = {} } = payload || {}
    const { filter: final } = await buildOpsFilter({
        DL,
        _admin,
        extraFilter,
        statusFilter: { $ne: 'cart' }
    })
    return DL.Order.Model.countDocuments(final)
}

count.config = {
    permissions: ['order:read', 'order:pick', 'order:ship']
}
