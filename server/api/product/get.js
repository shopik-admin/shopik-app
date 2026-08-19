export default async function get(payload, { DL, _user }) {
    const { filter = {}, path, id, barcode } = payload
    let products = []
    let categoryName
    if (barcode) {
        const product = await DL.Product.readOne({ barcode }, DL.Product.defaultSelectOne)
        products = [product]
    } else if (id) {
        const product = await DL.Product.readById(id, DL.Product.defaultSelectOne)
        products = [product]
    } else {
        if (path) {
            const pathParts = path.split('/').filter(p => p && p != 'products').map(p => decodeURIComponent(p))

            const category = await DL.Category.readOne({ path: pathParts.join('/') })
            if (category) {
                filter['category.pathIds'] = category.id
                categoryName = category.name
            }
        }
        products = await DL.Product.read(filter, DL.Product.defaultSelect, payload)
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

    return { products, sales, categoryName }
}

get.config = {
    auth: 'none'
}