import { Readable } from 'node:stream'

const COMAX_URL = process.env.COMAX_PRODUCTS_URL || 'https://ws.comax.co.il/Comax_WebServices/items_service.asmx/Get_AllItemsDetailsBySearch'
const COMAX_BALANCE_URL = 'https://ws.comax.co.il/Comax_WebServices/Items_Service.asmx/Get_AllItemsBalanceBySearch'
// SOAP POST endpoint: `Get_AllItemsBalanceBySearch_Extended` is only bound to
// the .asmx root (the GET-style `<Method>?params` form answers 500), and
// `NumDaysSold` is a query parameter next to the SOAP body.
const COMAX_SALES_WINDOW_URL = process.env.COMAX_SALES_WINDOW_URL || 'https://ws.comax.co.il/Comax_WebServices/Items_Service.asmx'
const COMAX_PROMOTIONS_URL = 'https://ws.comax.co.il/Comax_WebServices/Promotions_Service.asmx/GetPromotionsDef'

function buildUrl(url, params) {
    return `${url}?${new URLSearchParams(params)}`
}

/**
 * Never write the Comax password to the log collection.
 * The request params carry LoginPassword in clear text.
 */
function redactParams(params) {
    if (!params) return params
    return { ...params, LoginPassword: params.LoginPassword ? '***' : params.LoginPassword }
}

function startLog({ DL, action, fullUrl, params, skipLog }) {
    // skipLog: per-item backfills fire tens of thousands of requests; one Log
    // doc each would flood the collection. Callers opt out explicitly.
    if (skipLog) return null
    const log = DL.Log.start({
        action,
        direction: DL.Log.constants.DIRECTION.OUT,
        data: { request: { url: fullUrl, params: redactParams(params) } }
    })
    log.actor({ type: DL.Log.constants.ACTOR.API })
    return log
}

async function fetchComaxXml({ url, params, timeoutMs = 120000, action, skipLog }, { DL }) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let logPromise, log
    try {
        const fullUrl = buildUrl(url, params)
        log = startLog({ DL, action, fullUrl, params, skipLog })
        const response = await fetch(fullUrl, { signal: controller.signal })
        if (!response.ok) throw new Error(`Comax HTTP ${response.status}: ${response.statusText}`)
        const xml = await response.text()
        if (log) logPromise = log.success(`xml: ${xml.length} characters`)
        return xml
    } catch (error) {
        if (log) {
            logPromise = log.error({ message: error.message, stack: error.stack })
        }
        throw error
    } finally {
        if (logPromise) await logPromise
        clearTimeout(timer)
    }
}

export async function fetchComax({ params, timeoutMs = 120000, skipLog }, { DL }) {
    return fetchComaxXml({ url: COMAX_URL, params, timeoutMs, action: 'comax_fetch_products', skipLog }, { DL })
}

/**
 * Stream the products response instead of buffering it.
 *
 * The catalog can be hundreds of MB (a mass price update makes the Comax
 * delta the whole catalog). `response.text()` materialised all of it as one
 * string before a single item could be parsed — that alone exhausted the
 * container memory limit. This hands back the body as a stream so the caller
 * can parse item by item.
 *
 * The timeout is an IDLE timeout (reset on every chunk), not a total one: a
 * slow but healthy multi-minute download must not be killed half way.
 *
 * `body` + `url` switch it to a POST against another binding of the same
 * service (the sales-window call); the GET feeds leave both unset.
 *
 * @returns {AsyncGenerator<Buffer>} yields the raw response body
 */
export async function fetchComaxStream({ params, timeoutMs = 600000, skipLog, action = 'comax_fetch_products', url = COMAX_URL, body = null }, { DL }) {
    const controller = new AbortController()
    let logPromise, log
    let timer

    const armIdleTimer = () => {
        clearTimeout(timer)
        timer = setTimeout(() => controller.abort(new Error(`Comax request idle for ${timeoutMs}ms`)), timeoutMs)
    }

    try {
        const fullUrl = buildUrl(url, params)
        log = startLog({ DL, action, fullUrl, params, skipLog })

        // Armed before the request so a server that never answers the headers
        // is aborted too, not just a stalled download.
        armIdleTimer()
        const request = body == null
            ? { signal: controller.signal }
            : { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8' }, body, signal: controller.signal }
        const response = await fetch(fullUrl, request)
        if (!response.ok) throw new Error(`Comax HTTP ${response.status}: ${response.statusText}`)
        if (!response.body) throw new Error('Comax response had no body')

        armIdleTimer()
        const stream = Readable.fromWeb(response.body)
        let bytes = 0

        async function* chunks() {
            try {
                for await (const chunk of stream) {
                    bytes += chunk.length
                    armIdleTimer()
                    yield chunk
                }
                if (log) logPromise = log.success(`xml: ${bytes} bytes`)
            } catch (e) {
                if (log) logPromise = log.error({ message: e.message, stack: e.stack })
                throw e
            } finally {
                clearTimeout(timer)
                if (logPromise) await logPromise
            }
        }
        return chunks()
    } catch (error) {
        if (log) {
            logPromise = log.error({ message: error.message, stack: error.stack })
        }
        clearTimeout(timer)
        if (logPromise) await logPromise
        throw error
    }
}

export async function fetchComaxBalance({ params, timeoutMs = 120000 }, { DL }) {
    return fetchComaxXml({ url: COMAX_BALANCE_URL, params, timeoutMs, action: 'comax_fetch_balance' }, { DL })
}

function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

/**
 * SOAP body for the sales-window call. Parameters go in the envelope (unlike
 * the GET feeds) while `NumDaysSold` stays in the query string.
 */
export function buildSalesWindowEnvelope({ storeId, priceListId, loginId, loginPassword }) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Get_AllItemsBalanceBySearch_Extended xmlns="http://ws.comax.co.il/Comax_WebServices/">
      <ItemID></ItemID>
      <DepartmentID></DepartmentID>
      <GroupID></GroupID>
      <Sub_GroupID></Sub_GroupID>
      <ItemModelID></ItemModelID>
      <ItemColorID></ItemColorID>
      <ItemSizeID></ItemSizeID>
      <StoreID>${escapeXml(storeId)}</StoreID>
      <PriceListID>${escapeXml(priceListId)}</PriceListID>
      <StoreIDForOpenOrdersOffset></StoreIDForOpenOrdersOffset>
      <SupplierID></SupplierID>
      <CustomerID></CustomerID>
      <LastUpdatedFromDate></LastUpdatedFromDate>
      <LoginID>${escapeXml(loginId)}</LoginID>
      <LoginPassword>${escapeXml(loginPassword)}</LoginPassword>
      <ChangesAfter></ChangesAfter>
    </Get_AllItemsBalanceBySearch_Extended>
  </soap:Body>
</soap:Envelope>`
}

/**
 * One store's "what sold recently" feed, streamed.
 *
 * `NumDaysSold` is the widest configured window; the per-department decision is
 * made from each row's `LastSaleDate`. The envelope never carries the password
 * in the log — only `NumDaysSold` is recorded as params.
 */
export function fetchComaxSalesWindowStream({ days, storeId, priceListId, timeoutMs }, { DL }) {
    return fetchComaxStream({
        url: COMAX_SALES_WINDOW_URL,
        params: { NumDaysSold: days },
        body: buildSalesWindowEnvelope({
            storeId,
            priceListId: priceListId || process.env.COMAX_PRICELIST_ID,
            loginId: process.env.COMAX_LOGIN_ID,
            loginPassword: process.env.COMAX_LOGIN_PASSWORD
        }),
        action: 'comax_fetch_sales_window',
        timeoutMs
    }, { DL })
}

export async function fetchComaxPromotions({ params, timeoutMs = 120000 }, { DL }) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let logPromise, log
    try {
        const bodyData = {
            Params: typeof params === 'string' ? params : JSON.stringify(params),
            LoginID: process.env.COMAX_LOGIN_ID,
            LoginPassword: process.env.COMAX_LOGIN_PASSWORD
        }
        const logData = {
            action: 'comax_fetch_promotions',
            direction: DL.Log.constants.DIRECTION.OUT,
            data: {
                request: {
                    url: COMAX_PROMOTIONS_URL,
                    body: bodyData
                }
            }
        }
        log = DL.Log.start(logData)
        log.actor({ type: DL.Log.constants.ACTOR.API })

        const response = await fetch(COMAX_PROMOTIONS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify(bodyData),
            signal: controller.signal
        })

        if (!response.ok)
            throw new Error(`Comax HTTP ${response.status}: ${response.statusText}`)

        const json = await response.json()
        const promotions = json?.d || []
        logPromise = log.success(`promotions count: ${promotions.length}`)
        return promotions
    } catch (error) {
        if (log) {
            const errorData = {
                message: error.message,
                stack: error.stack
            }
            logPromise = log.error(errorData)
        }
        throw error
    } finally {
        if (logPromise)
            await logPromise
        clearTimeout(timer)
    }
}
