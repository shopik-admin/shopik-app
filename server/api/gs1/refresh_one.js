import { handleFetchJob } from '#server/workers/gs1FetchWorker.js'
import { collectProductCodes } from '#server/services/gs1/sync.js'

// POST /api/gs1/refresh_one {barcode} — inline single-product refresh (no queue).
// Resolves the GS1 product_code from the stored product, else scans 90d of messages.
export default async function gs1RefreshOne(payload, { DL, external }) {
    const barcode = String(payload?.barcode || '').trim()
    if (!barcode) throw { status: 400, message: 'barcode is required' }

    const product = await DL.Product.readOne(
        { barcode },
        { _id: 0, id: 1, barcode: 1, gs1ProductCode: 1, images: 1 }
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

    const result = await handleFetchJob(
        { data: { productCode, runId: null, onlyInStock: false, forceImages: true } },
        { DL, external }
    )

    // If images were queued, wait for the process worker (up to ~90s) for a complete response.
    if (result?.images === 'queued') {
        const before = (product.images?.product || []).length
        const deadline = Date.now() + 90000
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 3000))
            const current = await DL.Product.readOne(
                { barcode },
                { _id: 0, images: 1, gs1SyncedAt: 1 }
            ).catch(() => null)
            if (current && (current.images?.product || []).length !== before) break
            if (current?.images?.product?.[0]?.sourceUrl?.startsWith('gs1://')) break
        }
    }

    const fresh = await DL.Product.readOne(
        { barcode },
        { _id: 0, id: 1, barcode: 1, name: 1, producer: 1, images: 1, gs1SyncedAt: 1 }
    ).catch(() => null)
    return { result, product: fresh }
}

gs1RefreshOne.config = {
    required: ['barcode'],
    permissions: ['product:update'],
    auth: 'required'
}
