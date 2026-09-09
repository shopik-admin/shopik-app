// Public page resolver: ordered banner/carousel blocks for one page context.
// Cache: display:{domainId}:{path}:{mode}, 1h TTL.
//   off      → cached value is final (already sliced to preview limit)
//   annotate → cached wide base (with storeIds), inStock flags added per request
//   filter   → cached wide base, store-filtered + sliced per request
export default async function get(payload, { DL, _user, req, utils }) {
    const { path, domainId } = payload
    if (!path) throw { status: 400, message: 'path required' }
    if (!domainId) throw { status: 400, message: 'domainId required' }
    // Leading slash is canonical: '/sales' matches admin-stored paths and
    // keeps cache keys + category prefix logic consistent.
    const pagePath = path.startsWith('/') ? path : `/${path}`

    const display = utils.data.displayBlocks
    const { mode, storeId } = await utils.data.withStock.resolveStockContext(req, { DL, utils }, _user)
    const previewLimit = await display.getPreviewLimit(DL, domainId)

    const key = display.displayCacheKey(domainId, pagePath, mode)
    try {
        const cached = await DL.redis?.get(key)
        if (cached) return deriveView(JSON.parse(cached), mode, storeId, previewLimit)
    } catch {}

    const now = new Date()
    const blocks = await DL.DisplayBlock.read(
        { domainId, active: true },
        DL.DisplayBlock.defaultSelect,
        { limit: 0, sort: { order: 1 } }
    )

    // Current category for category placement matching (same path decoding as product/get).
    let currentCategory
    if (pagePath.startsWith('/products/')) {
        const categoryPath = pagePath
            .split('/')
            .filter(p => p && p !== 'products')
            .map(p => decodeURIComponent(p))
            .join('/')
        if (categoryPath) {
            currentCategory = await DL.Category.readOne(
                { path: categoryPath },
                { _id: 0, id: 1, parentIds: 1 }
            ).catch(() => null)
        }
    }

    const matched = blocks.filter(block => {
        const { start, end } = block.schedule || {}
        if (start && new Date(start) > now) return false
        if (end && new Date(end) < now) return false
        const placement = block.placement || {}
        if (placement.type === DL.DisplayBlock.constants.PLACEMENT.PATH)
            return placement.path === pagePath || placement.path === pagePath.replace(/^\//, '')
        if (placement.type === DL.DisplayBlock.constants.PLACEMENT.CATEGORY) {
            if (!currentCategory) return false
            if (placement.categoryId === currentCategory.id) return true
            return !!placement.includeSubcategories
                && (currentCategory.parentIds || []).includes(placement.categoryId)
        }
        return false
    })

    const baseLimit = await display.getBaseLimit(DL, domainId)
    const withProducts = []
    for (const block of matched) {
        if (block.kind !== DL.DisplayBlock.constants.KIND.PRODUCT_CAROUSEL) {
            withProducts.push(block)
            continue
        }
        const { products, sales } = await display.fetchCarouselBase(DL, block, domainId, baseLimit)
        if (mode === 'off') {
            const limit = Math.min(block.carousel?.limit || previewLimit, previewLimit)
            withProducts.push({
                ...block,
                products: products.slice(0, limit),
                sales: display.filterSalesFor(products.slice(0, limit), sales)
            })
        } else {
            withProducts.push({ ...block, products, sales })
        }
    }

    const response = { blocks: withProducts }
    try {
        await DL.redis?.set(key, JSON.stringify(response), 'EX', display.DISPLAY_CACHE_TTL_SEC)
    } catch {}

    return deriveView(response, mode, storeId, previewLimit)
}

function deriveView(response, mode, storeId, previewLimit) {
    // off entries are already final — deriveView is a no-op for them.
    if (mode === 'off' || !storeId) return response
    return {
        blocks: (response.blocks || []).map(block => {
            if (block.kind !== 'product_carousel' || !Array.isArray(block.products)) return block
            const limit = Math.min(block.carousel?.limit || previewLimit, previewLimit)
            let products = block.products
            if (mode === 'filter') {
                products = products.filter(p =>
                    Array.isArray(p.storeIds) && p.storeIds.includes(storeId))
            } else if (mode === 'annotate') {
                products = products.map(p => ({
                    ...p,
                    inStock: Array.isArray(p.storeIds) ? p.storeIds.includes(storeId) : true
                }))
            }
            products = products.slice(0, limit)
            const ids = new Set()
            for (const p of products) {
                if (Array.isArray(p?.saleIds)) {
                    for (const id of p.saleIds) ids.add(id)
                }
            }
            const sales = Object.fromEntries(
                Object.entries(block.sales || {}).filter(([id]) => ids.has(id))
            )
            return { ...block, products, sales }
        })
    }
}

get.config = {
    auth: 'none',
    required: ['path', 'domainId']
}
