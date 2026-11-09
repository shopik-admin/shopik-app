import { planUploadFiles, barcodeFromFileName, MAX_FILES } from '#server/services/image/uploadBulk.js'

/**
 * טעינת תמונות — step 1: what would these file names do?
 *
 * The client sends names and byte counts only (never the image bytes), so the
 * admin sees mistyped barcodes, duplicate barcodes carrying two extensions,
 * and which products will lose their GS1 alternates BEFORE a single file is
 * uploaded. Same two-step shape as product/load_kashrut.
 *
 * POST /api/product/upload_images_check { files: [{ name, bytes }] }
 */

const READ_CHUNK = 500

export default async function upload_images_check(payload, { DL }) {
    const files = Array.isArray(payload?.files) ? payload.files : []
    if (!files.length) throw { status: 400, message: 'no files selected' }
    if (files.length > MAX_FILES)
        throw { status: 400, message: `too many files (max ${MAX_FILES})` }

    const barcodes = [...new Set(files.map(file => barcodeFromFileName(file?.name)).filter(Boolean))]

    const products = []
    for (let i = 0; i < barcodes.length; i += READ_CHUNK) {
        const found = await DL.Product.read(
            { barcode: { $in: barcodes.slice(i, i + READ_CHUNK) } },
            { _id: 0, barcode: 1, id: 1, name: 1, images: 1 },
            { limit: 0 }
        )
        products.push(...(found || []))
    }

    return planUploadFiles(files, products)
}

upload_images_check.config = {
    required: ['files'],
    permissions: ['product:update'],
    preventMultiple: true
}
