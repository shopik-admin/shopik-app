// Public show-all data source for /carousel/:id.
// Replays the carousel's stored filter with live pagination (always uncached —
// deep pages are rare and skip-paginated on indexed queries).
export default async function carousel(payload, { DL, _user, req, utils }) {
    const { id, skip = 0, limit = 30, domainId } = payload
    if (!id) throw { status: 400, message: 'id required' }
    if (!domainId) throw { status: 400, message: 'domainId required' }

    const display = utils.data.displayBlocks
    const block = await DL.DisplayBlock.readOne(
        { id, domainId, active: true },
        DL.DisplayBlock.defaultSelect
    )
    if (!block || block.kind !== DL.DisplayBlock.constants.KIND.PRODUCT_CAROUSEL)
        throw { status: 404, message: 'carousel not found' }

    const { start, end } = block.schedule || {}
    const now = new Date()
    if ((start && new Date(start) > now) || (end && new Date(end) < now))
        throw { status: 404, message: 'carousel not found' }

    const resolved = await display.resolveCarouselFilter(DL, block.carousel, domainId)
    if (!resolved) {
        return { block: carouselMeta(block), products: [], sales: {} }
    }
    const { filter, search } = resolved
    const { mode, storeId } = await utils.data.withStock.resolveStockContext(req, { DL, utils }, _user)
    const effectiveFilter = (mode === 'filter' && storeId)
        ? utils.data.withStock.applyStockFilter(filter, storeId, mode)
        : filter
    const select = display.carouselSelect(DL)
    const pageLimit = Math.min(Math.max(Number(limit) || 30, 1), 100)

    let products
    if (search) {
        products = await DL.Product.search(search, effectiveFilter, {
            skip: Number(skip) || 0,
            limit: pageLimit,
            select
        })
    } else {
        products = await DL.Product.read(effectiveFilter, select, {
            skip: Number(skip) || 0,
            limit: pageLimit,
            sort: display.resolveCarouselSort(DL, block.carousel)
        })
    }
    if (mode === 'annotate' && storeId) {
        products = utils.data.withStock.annotateInStock(products, storeId, mode)
    }
    const sales = await display.collectSales(DL, products)
    return { block: carouselMeta(block), products, sales }
}

function carouselMeta(block) {
    return {
        id: block.id,
        title: block.title || block.name,
        autoplaySec: block.carousel?.autoplaySec || 0,
        showAllText: block.carousel?.showAllText || ''
    }
}

carousel.config = {
    auth: 'none',
    required: ['id', 'domainId']
}
