import { round2 } from '#common/functions/calcOrder/utils.js'

function esc(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

/**
 * Map a packed Shopik order to a WriteCustomersOrderByParamsExtendedPlusPrice
 * SOAP request. Client rule: Price=0 for every line so items land in Comax
 * with no cost. Quantity = finalAmount (packed qty); missing /
 * finalAmount<=0 lines are omitted.
 *
 * NOTE: the operation must be invoked as a SOAP POST. The ASMX GET
 * (query-string) form 500s on this install — its handler cannot bind the
 * string[] arrays from the URL (the doc's "link example" is stale).
 * Optional per-line arrays are omitted, never sent empty.
 */
export function buildCustomerOrderSoap(order, { customerId, comaxStoreId, priceListId, loginId, loginPassword }, opts = {}) {
    const unitPrice = opts.unitPrice ?? '0'
    const sendZeroTotals = Boolean(opts.sendZeroTotals)
    const lines = (order.cart || [])
        .map(l => ({
            // Comax item key: prefer comaxId when present, else barcode
            item: String(l.comaxId || l.barcode || '').trim(),
            qty: Number(l.finalAmount ?? l.amount ?? 0)
        }))
        .filter(l => l.item && Number.isFinite(l.qty) && l.qty > 0)

    const arr = (tag, vals) =>
        vals.length ? `<${tag}>${vals.map(v => `<string>${esc(v)}</string>`).join('')}</${tag}>` : ''
    const strArrays = [
        arr('Items', lines.map(l => l.item)),
        arr('Quantity', lines.map(l => String(l.qty))),
        arr('Price', lines.map(() => unitPrice))
    ]
    if (sendZeroTotals) {
        strArrays.push(arr('DiscountPercent', lines.map(() => '0')))
        strArrays.push(arr('TotalSum', lines.map(() => '0')))
    }
    const xml = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
        '<soap:Body>',
        '<WriteCustomersOrderByParamsExtendedPlusPrice xmlns="http://ws.comax.co.il/Comax_WebServices/">',
        `<CustomerID>${esc(customerId)}</CustomerID>`,
        `<StoreID>${esc(comaxStoreId)}</StoreID>`,
        `<PriceListID>${esc(priceListId)}</PriceListID>`,
        '<Mode>ADD</Mode>',
        `<Reference>${esc(order.number || '')}</Reference>`,
        '<PriceFromPriceList>FALSE</PriceFromPriceList>',
        ...strArrays,
        `<LoginID>${esc(loginId)}</LoginID>`,
        `<LoginPassword>${esc(loginPassword)}</LoginPassword>`,
        '</WriteCustomersOrderByParamsExtendedPlusPrice>',
        '</soap:Body>',
        '</soap:Envelope>'
    ].join('')
    return { xml, lines }
}

export function packedQty(order) {
    return round2((order.cart || []).reduce((s, l) => {
        if (l.missing) return s
        const q = Number(l.finalAmount ?? l.amount ?? 0)
        return s + (Number.isFinite(q) && q > 0 ? q : 0)
    }, 0))
}
