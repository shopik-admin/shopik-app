import log from '#server/utils/log.js'
import { enqueueImageJobs } from '#server/queues/imageQueue.js'

export default async function enqueueChangedImages(DL) {
    // Paged: the picUrl scan + $in:[all barcodes] product read held two full
    // catalog copies at once and OOMed 256MB containers when run after sync.
    const BATCH = Number(process.env.COMAX_SYNC_BATCH || 1000)
    const filter = { picUrl: { $exists: true, $nin: [null, ''] } }
    const total = await DL.ComaxProduct.Model.countDocuments(filter)
    if (!total) return { scanned: 0, enqueued: 0 }

    let scanned = 0
    let enqueued = 0
    let skippedGs1 = 0
    for (let skip = 0; skip < total; skip += BATCH) {
        const comaxProducts = await DL.ComaxProduct.Model.find(
            filter,
            { _id: 0, barcode: 1, picUrl: 1 }
        ).skip(skip).limit(BATCH).lean()
        if (!comaxProducts?.length) break
        scanned += comaxProducts.length

        const barcodes = [...new Set(comaxProducts.map(p => p.barcode).filter(Boolean))]
        if (!barcodes.length) continue

        const products = await DL.Product.read(
            { barcode: { $in: barcodes } },
            { _id: 0, id: 1, barcode: 1, images: 1 },
            { limit: 0 }
        )

        const productByBarcode = new Map(products.map(p => [p.barcode, p]))

        const jobs = []
        for (const comax of comaxProducts) {
            const product = productByBarcode.get(comax.barcode)
            if (!product || !comax.picUrl) continue

            const mainImage = (product.images?.product || []).find(img => img?.main)
            // GS1-sourced images are never touched — neither filled nor refreshed.
            if (mainImage?.sourceUrl?.startsWith('gs1://')) {
                skippedGs1++
                continue
            }
            // Own (Comax/manual) main unchanged → skip; missing or different → (re)fill.
            if (mainImage?.sourceUrl === comax.picUrl && mainImage?.hash) continue

            jobs.push({ productId: product.id, sourceUrl: comax.picUrl })
        }

        if (jobs.length) await enqueueImageJobs(jobs)
        enqueued += jobs.length
    }

    log.info(`[ImageQueue] Enqueued ${enqueued}/${scanned} products with images (skipped ${skippedGs1} GS1-imaged)`)

    return { scanned, enqueued }
}