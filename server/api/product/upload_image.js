import { applyProductUpload, barcodeFromFileName } from '#server/services/image/uploadBulk.js'

/**
 * טעינת תמונות — step 2: write one product main image from an uploaded file.
 *
 * One file per request on purpose: the client runs a small pool of these, so a
 * single bad image fails its own row instead of failing the whole run, and the
 * modal can show real progress. The barcode comes from the file NAME, re-parsed
 * server-side (upload_images_check only plans) so the naming rule lives in one
 * place.
 *
 * POST /api/product/upload_image { name: '3528.png', fileBase64 }
 */

export default function upload_image(payload, { DL }) {
    return applyProductUpload({ DL, name: payload?.name, fileBase64: payload?.fileBase64 })
}

upload_image.config = {
    required: ['name', 'fileBase64'],
    permissions: ['product:update'],
    // Per-barcode lock: the pool uploads different products in parallel, but
    // the same barcode must never be written twice at once.
    preventMultiple: payload => ':' + (barcodeFromFileName(payload?.name) || '')
}
