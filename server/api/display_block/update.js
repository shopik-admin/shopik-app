import diff from '#common/functions/diff.js'

export default async function update(payload, { DL, utils }) {
    const { id } = payload
    if (!id) throw { status: 400, message: 'Missing id' }

    const block = await DL.DisplayBlock.readById(id)
    if (!block) throw { status: 404, message: 'Display block not found' }

    if (payload.carousel?.filter?.categoryId) {
        const category = await DL.Category.readOne(
            { id: payload.carousel.filter.categoryId },
            { _id: 0, id: 1 }
        )
        if (!category) throw { status: 400, message: 'carousel category not found' }
    }

    if (payload.placement?.type === DL.DisplayBlock.constants.PLACEMENT.CATEGORY
        && payload.placement?.categoryId) {
        const category = await DL.Category.readOne(
            { id: payload.placement.categoryId },
            { _id: 0, id: 1 }
        )
        if (!category) throw { status: 400, message: 'category not found' }
    }

    if (payload.kind === DL.DisplayBlock.constants.KIND.BANNER
        && payload.banner && !payload.banner.slides?.length)
        throw { status: 400, message: 'banner.slides required' }

    const update = diff(block, payload)
    delete update.id
    delete update._id
    // Only carousels have a shopper-facing title.
    if ((update.kind || block.kind) === DL.DisplayBlock.constants.KIND.BANNER)
        delete update.title
    if (Object.keys(update).length === 0) return block

    const updated = await DL.DisplayBlock.updateOne({ id }, update)

    // Placement may have moved — invalidate both old and new contexts.
    await utils.data.displayBlocks.invalidateDisplayCache(DL, block.domainId, block)
    await utils.data.displayBlocks.invalidateDisplayCache(
        DL, updated?.domainId || block.domainId, updated || { ...block, ...update }
    )
    return updated
}

update.config = {
    required: ['id'],
    permissions: ['display_block:update']
}
