import storage from '#server/external/storage.js'
import { buildObjectPath, buildUrl } from './paths.js'

export default async function upload({ productId, sizes, key = '' }) {
    const uploads = Object.entries(sizes).map(async ([name, data]) => {
        await storage.uploadFile({
            path: buildObjectPath(productId, name, key),
            data,
            contentType: 'image/webp',
            cacheControl: 'public, max-age=31536000, immutable'
        })
        return [name, buildUrl(productId, name, key)]
    })

    return Object.fromEntries(await Promise.all(uploads))
}