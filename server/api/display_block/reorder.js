// Persist admin drag-and-drop ordering for one page context.
// Every id must belong to the same domain + placement context; order is the
// array position.
export default async function reorder(payload, { DL, utils }) {
    const { domainId, placement, orderedIds } = payload
    if (!domainId || !placement?.type || !Array.isArray(orderedIds) || !orderedIds.length)
        throw { status: 400, message: 'domainId, placement and orderedIds required' }
    const domain = String(domainId)
    // Canonicalize once: stored paths always start with '/' (see create/update).
    const contextPath = placement.path && !placement.path.startsWith('/')
        ? `/${placement.path}`
        : placement.path

    const blocks = await DL.DisplayBlock.read(
        { id: { $in: orderedIds.map(String) }, domainId: domain },
        { _id: 0, id: 1, placement: 1, domainId: 1 },
        { limit: 0 }
    )
    if (blocks.length !== orderedIds.length)
        throw { status: 400, message: 'unknown block ids' }

    for (const block of blocks) {
        const sameContext = block.placement?.type === placement.type
            && (placement.type === DL.DisplayBlock.constants.PLACEMENT.PATH
                ? block.placement?.path === contextPath
                : block.placement?.categoryId === placement.categoryId)
        if (!sameContext)
            throw { status: 400, message: `block ${block.id} is not in this page context` }
    }

    await DL.DisplayBlock.Model.bulkWrite(
        orderedIds.map((blockId, index) => ({
            updateOne: { filter: { id: String(blockId) }, update: { $set: { order: index } } }
        }))
    )

    await utils.data.displayBlocks.invalidateDisplayCache(
        DL, domain, { placement: { ...placement, path: contextPath } }
    )
    return { ok: true, count: orderedIds.length }
}

reorder.config = {
    required: ['domainId', 'placement', 'orderedIds'],
    permissions: ['display_block:update'],
    preventMultiple: p => ':' + p.domainId + ':' + (p.placement?.path || p.placement?.categoryId || '')
}
