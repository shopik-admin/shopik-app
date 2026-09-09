import diff from '#common/functions/diff.js'

export default async function update(payload, { DL, utils }) {
    const { id } = payload
    if (!id) throw { status: 400, message: 'Missing id' }

    const block = await DL.DisplayBlock.readById(id)
    if (!block) throw { status: 404, message: 'Display block not found' }

    const KIND = DL.DisplayBlock.constants.KIND
    const PLACEMENT = DL.DisplayBlock.constants.PLACEMENT
    const resultingKind = payload.kind || block.kind

    // domainId is immutable — blocks never move across tenants.
    if (payload.domainId && payload.domainId !== block.domainId)
        throw { status: 400, message: 'domainId cannot be changed' }

    if (payload.order !== undefined) {
        const n = Number(payload.order)
        if (!Number.isFinite(n) || n < 0)
            throw { status: 400, message: 'order must be a non-negative number' }
        payload.order = Math.floor(n)
    }

    // Partial subdocs replace wholesale in Mongo — merge with the stored block
    // first so a layout-only edit can't wipe slides (same for the rest).
    if (payload.placement) {
        payload.placement = { ...block.placement, ...payload.placement }
        if (payload.placement.type === PLACEMENT.PATH && payload.placement.path
            && !payload.placement.path.startsWith('/'))
            payload.placement.path = `/${payload.placement.path}`
    }
    if (payload.banner)
        payload.banner = { ...block.banner, ...payload.banner }
    if (payload.carousel) {
        payload.carousel = { ...block.carousel, ...payload.carousel }
        if (payload.carousel.filter || block.carousel?.filter)
            payload.carousel.filter = { ...block.carousel?.filter, ...payload.carousel?.filter }
    }
    if (payload.schedule)
        payload.schedule = { ...block.schedule, ...payload.schedule }

    // Validate the merged result (covers both full and partial payloads).
    const placement = payload.placement || block.placement || {}
    if (placement.type === PLACEMENT.CATEGORY) {
        if (!placement.categoryId)
            throw { status: 400, message: 'placement.categoryId required for category placement' }
        const category = await DL.Category.readOne({ id: placement.categoryId }, { _id: 0, id: 1 })
        if (!category) throw { status: 400, message: 'category not found' }
    } else if (placement.type === PLACEMENT.PATH) {
        if (!placement.path)
            throw { status: 400, message: 'placement.path required for path placement' }
    }

    const carouselFilter = payload.carousel?.filter || block.carousel?.filter
    if (carouselFilter?.categoryId) {
        const category = await DL.Category.readOne(
            { id: carouselFilter.categoryId },
            { _id: 0, id: 1 }
        )
        if (!category) throw { status: 400, message: 'carousel category not found' }
    }

    if (resultingKind === KIND.BANNER) {
        const slides = payload.banner?.slides ?? block.banner?.slides
        if (!slides?.length)
            throw { status: 400, message: 'banner.slides required' }
    }

    const schedule = payload.schedule || block.schedule || {}
    const start = schedule.start ? new Date(schedule.start) : null
    const end = schedule.end ? new Date(schedule.end) : null
    if (schedule.start && isNaN(start))
        throw { status: 400, message: 'schedule.start is not a valid date' }
    if (schedule.end && isNaN(end))
        throw { status: 400, message: 'schedule.end is not a valid date' }
    if (start && end && start > end)
        throw { status: 400, message: 'schedule.start must be before schedule.end' }

    const update = diff(block, payload)
    delete update.id
    delete update._id
    // Only carousels have a shopper-facing title.
    if (resultingKind === KIND.BANNER)
        delete update.title
    // Kind switch: drop the obsolete branch (diff can't express deletion).
    if (payload.kind && payload.kind !== block.kind)
        update.$unset = { [payload.kind === KIND.BANNER ? 'carousel' : 'banner']: 1 }
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
