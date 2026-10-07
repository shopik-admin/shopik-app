import { parseXml, normalizeArray } from './parser.js'
import { buildCustomerOrderSoap } from './orderMapper.js'
import { resolveComaxOrderConfig } from './resolveOrderConfig.js'

const ORDERS_URL = 'https://ws.comax.co.il/Comax_WebServices/CustomersOrders_Service.asmx'
const SOAP_ACTION = '"http://ws.comax.co.il/Comax_WebServices/WriteCustomersOrderByParamsExtendedPlusPrice"'

function extractResult(parsed) {
    const env = parsed?.['soap:Envelope']?.['soap:Body'] ?? parsed
    const resp = env?.WriteCustomersOrderByParamsExtendedPlusPriceResponse
        ?? parsed?.WriteCustomersOrderByParamsExtendedPlusPriceResponse
    const result = resp?.WriteCustomersOrderByParamsExtendedPlusPriceResult ?? resp
    return result || null
}

/**
 * Create the Comax customer order for a packed Shopik order.
 * Price=0 for all lines (client rule). Fail-open: throws on error, caller decides.
 * Returns { docNumber, totalSum, linesCount, totalQuantity }.
 */
export async function writeCustomerOrder({ DL, order, timeoutMs = 60000, opts = {} }) {
    const cfg = await resolveComaxOrderConfig(DL, order.storeId)
    if (!cfg.customerId) throw new Error('missing Comax CustomerID (cash_register.data.OrderCustomerID or COMAX_CUSTOMER_ID)')
    if (!cfg.comaxStoreId) throw new Error('missing Comax StoreID (cash_register.data.OrderStoreID or COMAX_STORE_ID)')

    const { xml, lines } = buildCustomerOrderSoap(order, {
        customerId: cfg.customerId,
        comaxStoreId: cfg.comaxStoreId,
        priceListId: cfg.priceListId,
        loginId: cfg.loginId,
        loginPassword: cfg.loginPassword
    }, opts)
    if (!lines.length) throw new Error('no packable lines (all missing/zero qty)')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    // Full sent payload (password excluded) so the logs collection shows
    // exactly what Comax received. View: logs where action=comax_write_customer_order.
    const log = DL.Log.start({
        action: 'comax_write_customer_order',
        direction: DL.Log.constants.DIRECTION.OUT,
        data: {
            request: {
                orderId: order.id, orderNumber: order.number,
                customerId: cfg.customerId, storeId: cfg.comaxStoreId, priceListId: cfg.priceListId,
                mode: 'ADD', reference: String(order.number || ''), priceFromPriceList: false,
                transport: 'soap-post',
                lines: lines.map(l => ({ item: l.item, qty: l.qty, price: opts.unitPrice ?? '0' }))
            }
        }
    })
    try {
        log.actor({ type: DL.Log.constants.ACTOR.API })
        // SOAP POST — the ASMX GET form 500s on array params (see orderMapper).
        const response = await fetch(ORDERS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                SOAPAction: SOAP_ACTION
            },
            body: xml,
            signal: controller.signal
        })
        // Capture fault bodies — otherwise all we keep is the bare HTTP status.
        const rawBody = await response.text().catch(() => '')
        if (!response.ok) {
            const fault = rawBody.replace(/\s+/g, ' ').trim().slice(0, 800)
            throw new Error(`Comax HTTP ${response.status}: ${response.statusText}${fault ? ` — ${fault}` : ''}`)
        }
        const result = extractResult(parseXml(rawBody))
        const errs = normalizeArray(result?.Err?.ClsErrors).filter(e => e?.ErrorType && String(e.ErrorType) !== 'Unknown' && String(e.ErrorType) !== '')
        // Comax returns Err entries only on failure; empty Err = success
        const hasErr = errs.length > 0 || (result?.DocNumber != null && String(result.DocNumber) === '0' && errs.length > 0)
        if (errs.length > 0) {
            const first = errs[0]
            throw new Error(`Comax order failed: ${first.ErrorType}${first.ItemID ? ` (item ${first.ItemID})` : ''}`)
        }
        const docNumber = result?.DocNumber != null ? String(result.DocNumber) : ''
        if (!docNumber || docNumber === '0') throw new Error('Comax order failed: empty DocNumber')
        const out = {
            docNumber,
            totalSum: result?.TotalSum != null ? Number(result.TotalSum) : 0,
            linesCount: result?.LinesCount != null ? String(result.LinesCount) : String(lines.length),
            totalQuantity: result?.TotalQuantity != null ? String(result.TotalQuantity) : '',
            hasErr
        }
        await log.success({ orderId: order.id, ...out }).catch(() => {})
        return out
    } catch (e) {
        await log.error({ orderId: order.id, message: e?.message || String(e) }).catch(() => {})
        throw e
    } finally {
        clearTimeout(timer)
    }
}

export default { writeCustomerOrder }
