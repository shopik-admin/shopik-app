import storage from '#server/external/storage.js'
import download from '#server/services/image/download.js'
import resize from '#server/services/image/resize.js'
import { BANNER_SIZES } from '#server/services/image/constants.js'
import uid from '#common/functions/uid.js'
import { sha1 } from '#server/utils/data/displayBlocks.js'

const MAX_BYTES = 8 * 1024 * 1024

// Upload one banner slide image through the standard pipeline
// (download → sharp webp variants → GCS), accepting either a pasted URL or a
// base64 file upload. Both end up as files in our bucket.
// Stores/returns only the RELATIVE base path — the client prepends
// VITE_FILES_BASE_URL (see common/functions/displayImageUrl.js).
export default async function upload_image(payload) {
    const { imageBase64, sourceUrl, blockId, slideKey } = payload
    if (!imageBase64 && !sourceUrl)
        throw { status: 400, message: 'imageBase64 or sourceUrl required' }

    let buffer
    if (imageBase64) {
        if (Buffer.byteLength(imageBase64, 'utf8') > MAX_BYTES)
            throw { status: 400, message: 'image too large' }
        buffer = Buffer.from(imageBase64, 'base64')
    } else {
        buffer = await download(sourceUrl)
    }
    if (!buffer?.length || buffer.length > 20 * 1024 * 1024)
        throw { status: 400, message: 'image too large' }

    const sizes = await resize(buffer, BANNER_SIZES)
    const basePath = [
        'images',
        'display-blocks',
        blockId || `tmp-${uid()}`,
        slideKey || uid()
    ].join('/')

    await Promise.all(
        Object.entries(sizes).map(([name, data]) =>
            storage.uploadFile({
                path: `${basePath}/${name}.webp`,
                data,
                contentType: 'image/webp',
                cacheControl: 'public, max-age=31536000, immutable'
            })
        )
    )

    return { basePath, sizes: Object.keys(sizes), hash: sha1(basePath) }
}

upload_image.config = {
    permissions: ['display_block:update']
}
