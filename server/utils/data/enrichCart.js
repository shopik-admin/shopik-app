const PRODUCT_PROJECTION = {
    _id: 0,
    id: 1,
    barcode: 1,
    images: 1,
    label: 1,
    producer: 1,
    category: 1,
    storageType: 1,
    picking: 1,
    unit: 1
}

function itemNeedsEnrich(item) {
    return !item.images || !item.images.product?.length ||
        !item.storageType || !item.category || !item.label ||
        !item.unit || item.unit.step == null || item.unit.minAmount == null
}

function mergeProductData(item, prod) {
    if (!prod) return
    if (!item.images || !item.images.product?.length) item.images = prod.images || item.images
    if (!item.label && prod.label) item.label = prod.label
    if (!item.producer && prod.producer) item.producer = prod.producer
    if (!item.category && prod.category) item.category = prod.category
    if (!item.storageType && prod.storageType) item.storageType = prod.storageType
    if (!item.picking && prod.picking) item.picking = prod.picking
    if (prod.unit) {
        if (!item.unit) item.unit = {}
        if (item.unit.type == null && prod.unit.type) item.unit.type = prod.unit.type
        if (item.unit.baseUnit == null && prod.unit.baseUnit) item.unit.baseUnit = prod.unit.baseUnit
        if (item.unit.minAmount == null && prod.unit.minAmount != null) item.unit.minAmount = prod.unit.minAmount
        if (item.unit.step == null && prod.unit.step != null) item.unit.step = prod.unit.step
    }
}

async function fetchProductsForItems(items, DL) {
    const ids = items.map(item => item.id).filter(Boolean)
    const barcodes = items.map(item => item.barcode).filter(Boolean)
    const or = []
    if (ids.length) or.push({ id: { $in: ids } })
    if (barcodes.length) or.push({ barcode: { $in: barcodes } })
    if (!or.length) return { byId: new Map(), byBarcode: new Map() }
    const query = or.length === 1 ? or[0] : { $or: or }

    const products = await DL.Product.Model.find(query, PRODUCT_PROJECTION).lean()
    return {
        byId: new Map(products.map(p => [p.id, p])),
        byBarcode: new Map(products.map(p => [p.barcode, p]))
    }
}

function lookupItem(item, { byId, byBarcode }) {
    return (item.id && byId.get(item.id)) || (item.barcode && byBarcode.get(item.barcode))
}

export default async function enrichCart(order, DL) {
    if (!order?.cart?.length || !DL?.Product?.Model) return order
    const needsEnrich = order.cart.filter(itemNeedsEnrich)
    if (!needsEnrich.length) return order

    const lookup = await fetchProductsForItems(needsEnrich, DL)
    for (const item of needsEnrich) {
        mergeProductData(item, lookupItem(item, lookup))
    }
    return order
}

export async function enrichOrders(orders, DL) {
    if (!Array.isArray(orders) || !orders.length) return orders
    const needItems = []
    for (const order of orders) {
        if (!order?.cart?.length) continue
        for (const item of order.cart) {
            if (itemNeedsEnrich(item)) needItems.push(item)
        }
    }
    if (!needItems.length) return orders

    const lookup = await fetchProductsForItems(needItems, DL)
    for (const item of needItems) {
        mergeProductData(item, lookupItem(item, lookup))
    }
    return orders
}
