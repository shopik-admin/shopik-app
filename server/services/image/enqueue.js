import log from '#server/utils/log.js'
import { enqueueImageJobs } from '#server/queues/imageQueue.js'

export default async function enqueueChangedImages(DL) {
    const comaxProducts = await DL.ComaxProduct.Model.find(
        { picUrl: { $exists: true, $ne: null, $ne: '' } },
        { _id: 0, barcode: 1, picUrl: 1 }
    ).lean()

    if (!comaxProducts?.length)
        return { scanned: 0, enqueued: 0 }

    const barcodes = [...new Set(comaxProducts.map(p => p.barcode).filter(Boolean))]
    if (!barcodes.length)
        return { scanned: comaxProducts.length, enqueued: 0 }

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
        if (mainImage?.sourceUrl === comax.picUrl && mainImage?.hash) continue

        jobs.push({ productId: product.id, sourceUrl: comax.picUrl })
    }

    await enqueueImageJobs(jobs)

    log.info(`[ImageQueue] Enqueued ${jobs.length}/${comaxProducts.length} products with images`)

    return { scanned: comaxProducts.length, enqueued: jobs.length }
}