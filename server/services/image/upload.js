import storage from '#server/external/storage.js'
import { buildObjectPath, buildUrl } from './paths.js'

// serial:true uploads one size at a time (lower peak memory + fewer concurrent
// GCS streams). Default parallel preserves existing behavior (Comax flow).
export default async function upload({ productId, sizes, key = '', serial = false }) {
    const runOne = async ([name, data]) => {
        await storage.uploadFile({
            path: buildObjectPath(productId, name, key),
            data,
            contentType: 'image/webp',
            cacheControl: 'public, max-age=31536000, immutable'
        })
        return [name, buildUrl(productId, name, key)]
    }
    const list = Object.entries(sizes)
    if (!serial) {
        return Object.fromEntries(await Promise.all(list.map(runOne)))
    }
    const entries = []
    for (const item of list) {
        entries.push(await runOne(item))
    }
    return Object.fromEntries(entries)
}