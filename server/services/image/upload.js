import storage from '#server/external/storage.js'
import { buildObjectPath, buildUrl } from './paths.js'

export default async function upload({ productId, sizes }) {
    const uploads = Object.entries(sizes).map(async ([name, data]) => {
        await storage.uploadFile({
            path: buildObjectPath(productId, name),
            data,
            contentType: 'image/webp',
            cacheControl: 'public, max-age=31536000, immutable'
        })
        return [name, buildUrl(productId, name)]
    })

    return Object.fromEntries(await Promise.all(uploads))
}