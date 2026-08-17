export default async function get(payload, { DL, _user }) {
    const { filter = {}, path, id, barcode } = payload

    let products = []
    if (barcode) {
        const product = await DL.Product.readOne({ barcode }, DL.Product.defaultSelectOne)
        products = [product]
    } else if (id) {
        const product = await DL.Product.readById(id, DL.Product.defaultSelectOne)
        products = [product]
    } else {
        if (path) {
            const pathParts = path.split('/')
            const decodedParts = pathParts
                .filter(Boolean)
                .map(decodeURIComponent)
            const category = await DL.Category.readOne({ name: decodedParts[decodedParts.length - 1] })
            if (category)
                filter['category.pathIds'] = category.id
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

    return { products, sales }
}

get.config = {
    auth: 'none'
}