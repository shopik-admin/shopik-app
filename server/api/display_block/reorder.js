// Persist admin drag-and-drop ordering for one page context.
// Every id must belong to the same domain + placement context; order is the
// array position.
export default async function reorder(payload, { DL, utils }) {
    const { domainId, placement, orderedIds } = payload
    if (!domainId || !placement?.type || !Array.isArray(orderedIds) || !orderedIds.length)
        throw { status: 400, message: 'domainId, placement and orderedIds required' }

    const blocks = await DL.DisplayBlock.read(
        { id: { $in: orderedIds }, domainId },
        { _id: 0, id: 1, placement: 1, domainId: 1 },
        { limit: 0 }
    )
    if (blocks.length !== orderedIds.length)
        throw { status: 400, message: 'unknown block ids' }

    for (const block of blocks) {
        const sameContext = block.placement?.type === placement.type
            && (placement.type === DL.DisplayBlock.constants.PLACEMENT.PATH
                ? block.placement?.path === placement.path
                : block.placement?.categoryId === placement.categoryId)
        if (!sameContext)
            throw { status: 400, message: `block ${block.id} is not in this page context` }
    }

    await DL.DisplayBlock.Model.bulkWrite(
        orderedIds.map((blockId, index) => ({
            updateOne: { filter: { id: blockId }, update: { $set: { order: index } } }
        }))
    )

    await utils.data.displayBlocks.invalidateDisplayCache(
        DL, domainId, { placement }
    )
    return { ok: true, count: orderedIds.length }
}

reorder.config = {
    required: ['domainId', 'placement', 'orderedIds'],
    permissions: ['display_block:update']
}
