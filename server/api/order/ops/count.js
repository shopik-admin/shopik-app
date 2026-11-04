import buildOpsFilter, { opsSearchMatch } from '#server/utils/data/opsFilter.js'

export default async function count(payload, { DL, _admin }) {
    // Same queue scoping as list.js (shared builder), without pagination — so a
    // tab badge can never count rows the tab itself would not show.
    const { filter: extraFilter = {}, search } = payload || {}
    const { filter: final } = await buildOpsFilter({ _admin, extraFilter })
    return DL.Order.Model.countDocuments(opsSearchMatch(DL.Order.Model, final, search))
}

count.config = {
    permissions: ['order:read', 'order:pick', 'order:ship', 'order:pick:manage', 'order:ship:manage']
}
