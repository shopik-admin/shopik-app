import syncStockForStores from './syncStock.js'

export default async function sync(payload, { DL, external }) {
    const { storeId } = payload
    const result = await syncStockForStores({ storeId }, { DL, external })
    return result
}

sync.config = {
    permissions: ['cash_register:sync'],
    preventMultiple: true
}
