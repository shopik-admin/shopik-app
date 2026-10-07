import { round2 } from '#common/functions/calcOrder/utils.js'

/**
 * Map a packed Shopik order to WriteCustomersOrderByParamsExtendedPlusPrice params.
 * Client rule: Price=0 for every line so items land in Comax with no cost.
 * Quantity = finalAmount (packed qty); missing / finalAmount<=0 lines are omitted.
 */
export function buildCustomerOrderParams(order, { customerId, comaxStoreId, priceListId, loginId, loginPassword }) {
    const lines = (order.cart || [])
        .map(l => ({
            // Comax item key: prefer comaxId when present, else barcode
            item: String(l.comaxId || l.barcode || '').trim(),
            qty: Number(l.finalAmount ?? l.amount ?? 0),
            barcode: String(l.barcode || '')
        }))
        .filter(l => l.item && Number.isFinite(l.qty) && l.qty > 0)

    const params = new URLSearchParams()
    params.set('CustomerID', String(customerId))
    params.set('StoreID', String(comaxStoreId || ''))
    params.set('PriceListID', String(priceListId || ''))
    params.set('Mode', 'ADD')
    params.set('Reference', String(order.number || ''))
    params.set('PriceFromPriceList', 'FALSE')
    for (const l of lines) {
        params.append('Items', l.item)
        params.append('Quantity', String(l.qty))
        params.append('Price', '0')
        params.append('DiscountPercent', '')
        params.append('TotalSum', '')
        params.append('ItemRemarks', '')
        params.append('PromoID', '')
        params.append('PromoRank', '')
    }
    params.set('LoginID', loginId || '')
    params.set('LoginPassword', loginPassword || '')
    return { params, lines }
}

export function packedQty(order) {
    return round2((order.cart || []).reduce((s, l) => {
        if (l.missing) return s
        const q = Number(l.finalAmount ?? l.amount ?? 0)
        return s + (Number.isFinite(q) && q > 0 ? q : 0)
    }, 0))
}
