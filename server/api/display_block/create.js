export default async function create(payload, { DL, utils }) {
    const { kind, name, title, domainId, placement, order, schedule, banner, carousel } = payload

    if (!kind || !name || !domainId || !placement?.type)
        throw { status: 400, message: 'kind, name, domainId and placement.type required' }

    const validKinds = Object.values(DL.DisplayBlock.constants.KIND)
    if (!validKinds.includes(kind))
        throw { status: 400, message: `kind must be one of ${validKinds.join(', ')}` }

    if (placement.type === DL.DisplayBlock.constants.PLACEMENT.PATH) {
        if (!placement.path)
            throw { status: 400, message: 'placement.path required for path placement' }
        if (!placement.path.startsWith('/'))
            placement.path = `/${placement.path}`
    }

    if (placement.type === DL.DisplayBlock.constants.PLACEMENT.CATEGORY) {
        if (!placement.categoryId)
            throw { status: 400, message: 'placement.categoryId required for category placement' }
        const category = await DL.Category.readOne({ id: placement.categoryId }, { _id: 0, id: 1 })
        if (!category) throw { status: 400, message: 'category not found' }
    }

    if (kind === DL.DisplayBlock.constants.KIND.BANNER) {
        if (!banner?.slides?.length)
            throw { status: 400, message: 'banner.slides required' }
        for (const slide of banner.slides) {
            if (!slide?.image) throw { status: 400, message: 'each slide needs an image' }
        }
    }

    if (kind === DL.DisplayBlock.constants.KIND.PRODUCT_CAROUSEL) {
        if (carousel?.filter?.categoryId) {
            const category = await DL.Category.readOne({ id: carousel.filter.categoryId }, { _id: 0, id: 1 })
            if (!category) throw { status: 400, message: 'carousel category not found' }
        }
    }

    const isCarousel = kind === DL.DisplayBlock.constants.KIND.PRODUCT_CAROUSEL
    const created = await DL.DisplayBlock.create({
        kind,
        name,
        // Only carousels have a shopper-facing title.
        ...(isCarousel && title ? { title } : {}),
        domainId,
        placement: {
            type: placement.type,
            path: placement.path,
            categoryId: placement.categoryId,
            includeSubcategories: !!placement.includeSubcategories
        },
        order: Number(order) || 0,
        schedule,
        banner: kind === DL.DisplayBlock.constants.KIND.BANNER ? banner : undefined,
        carousel: kind === DL.DisplayBlock.constants.KIND.PRODUCT_CAROUSEL ? carousel : undefined
    })

    await utils.data.displayBlocks.invalidateDisplayCache(DL, domainId, created)
    return created
}

create.config = {
    required: ['kind', 'name', 'domainId', 'placement'],
    permissions: ['display_block:create'],
    preventMultiple: true
}
