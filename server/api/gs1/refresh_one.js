import { handleFetchJob } from '#server/workers/gs1FetchWorker.js'
import { collectProductCodes } from '#server/services/gs1/sync.js'
import { enrichBatch } from '#server/services/gs1/enrich.js'
import { flush, initBulkFlusher } from '#server/services/gs1/bulk.js'

// POST /api/gs1/refresh_one {barcode} — inline single-product refresh (no queue).
// Dumps raw, enriches texts, flushes. Images arrive via phase 3 (runImages/process queue).
export default async function gs1RefreshOne(payload, { DL, external }) {
    initBulkFlusher(DL)
    const barcode = String(payload?.barcode || '').trim()
    if (!barcode) throw { status: 400, message: 'barcode is required' }

    const product = await DL.Product.readOne(
        { barcode },
        { _id: 0, id: 1, barcode: 1, gs1ProductCode: 1 }
    )
    if (!product) throw { status: 404, message: 'product not found' }

    let productCode = product.gs1ProductCode
    if (!productCode) {
        const to = new Date()
        const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000)
        const codes = await collectProductCodes(external, from, to)
        productCode = codes.find(c => c.includes(`_${barcode}_`))
        if (!productCode) throw { status: 404, message: `no GS1 product_code for barcode ${barcode} in last 90d` }
    }

    const fetchResult = await handleFetchJob(
        { data: { productCode, runId: null, force: true } },
        { DL, external }
    )
    // Enrich at least this barcode's raw (batch may include other fetched raws — fine, it's bulk).
    const enrichResult = await enrichBatch({ DL, external, runId: null, onlyInStock: false })
    await flush()

    const fresh = await DL.Product.readOne(
        { barcode },
        { _id: 0, id: 1, barcode: 1, name: 1, producer: 1, label: 1, gs1: 1, gs1SyncedAt: 1 }
    ).catch(() => null)
    return { fetchResult, enrichResult, product: fresh }
}

gs1RefreshOne.config = {
    required: ['barcode'],
    permissions: ['product:update'],
    auth: 'required'
}
