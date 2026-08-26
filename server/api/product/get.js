export default async function get(payload, { DL, _user }) {
    const { filter = {}, path, id, barcode } = payload
    if (id !== undefined && typeof id !== 'string')
        throw { status: 400, message: 'invalid id' }
    if (barcode !== undefined && typeof barcode !== 'string')
        throw { status: 400, message: 'invalid barcode' }
    if (path !== undefined && typeof path !== 'string')
        throw { status: 400, message: 'invalid path' }

    let safeFilter = {}
    if (filter && typeof filter === 'object' && !Array.isArray(filter)) {
        for (const [key, val] of Object.entries(filter)) {
            if (key.startsWith('$')) continue
            if (val === null || ['string', 'number', 'boolean'].includes(typeof val)) safeFilter[key] = val
        }
    }

    let products = []
    let categoryName
    let categoryPath
    if (barcode) {
        const product = await DL.Product.readOne({ barcode }, DL.Product.defaultSelectOne)
        products = [product]
    } else if (id) {
        const product = await DL.Product.readById(id, DL.Product.defaultSelectOne)
        products = [product]
        if (product?.category?.id) {
            const category = await DL.Category.readOne({ id: product.category.id }, { _id: 0, path: 1 })
            categoryPath = category?.path
        }
    } else {
        if (path) {
            const pathParts = path.split('/').filter(p => p && p != 'products').map(p => decodeURIComponent(p))

            const category = await DL.Category.readOne({ path: pathParts.join('/') })
            if (category) {
                safeFilter['category.pathIds'] = category.id
                categoryName = category.name
            }
        }
        products = await DL.Product.read(safeFilter, DL.Product.defaultSelect, {
            ...payload,
            limit: Math.min(Math.max(Number(payload.limit) || 50, 1), 100),
            skip: Math.min(Math.max(Number(payload.skip) || 0, 0), 10000)
        })
    }

    // Collect all saleIds from returned products
    const saleIdSet = new Set()
    for (const product of products) {
        if (product.saleIds && Array.isArray(product.saleIds)) {
            for (const saleId of product.saleIds) {
                saleIdSet.add(saleId)
            }
        }
    }

    let sales = {}
    if (saleIdSet.size > 0) {
        const activeSales = await DL.Sale.read(
            {
                id: { $in: Array.from(saleIdSet) },
                status: DL.Sale.constants.STATUS.ACTIVE
            },
            DL.Sale.defaultSelect,
            { limit: 0 }
        )

        for (const sale of activeSales) {
            sales[sale.id] = sale
        }
    }

    return { products, sales, categoryName, categoryPath }
}

get.config = {
    auth: 'none'
}