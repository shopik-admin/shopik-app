import { invalidateMenu } from '#server/utils/data/getMenu.js'
import { MAX_UPLOAD_BYTES, deleteIcon, saveIcon, toIconWebp } from '#server/services/categoryIcon.js'

/**
 * Upload a category icon. The image (PNG/JPEG/WebP) is re-encoded as a WebP
 * and stored under `images/categories/<id>/<version>/icon.webp`;
 * `category.icon` keeps that relative object path (rendered via FILES_BASE_URL).
 */
export default async function upload_icon({ id, fileBase64 }, { DL }) {
    if (!id) throw { status: 400, message: 'id required' }
    if (!fileBase64) throw { status: 400, message: 'fileBase64 required' }

    const category = await DL.Category.readById(id)
    if (!category) throw { status: 404, message: 'category not found' }

    let buffer
    try {
        buffer = Buffer.from(String(fileBase64).split(',').pop(), 'base64')
    } catch {
        throw { status: 400, message: 'invalid file' }
    }
    if (!buffer?.length) throw { status: 400, message: 'empty file' }
    if (buffer.length > MAX_UPLOAD_BYTES)
        throw { status: 400, message: `file too large (max ${Math.floor(MAX_UPLOAD_BYTES / 1024)}KB)` }

    const data = await toIconWebp(buffer)
    const icon = await saveIcon({ categoryId: category.id, data })

    const updated = await DL.Category.updateOne({ id }, { icon })
    if (!updated) {
        await deleteIcon(icon)
        throw { status: 404, message: 'category could not be updated' }
    }

    await invalidateMenu({ DL })
    return { icon, category: updated }
}

upload_icon.config = {
    required: ['id', 'fileBase64'],
    permissions: ['category:update']
}
