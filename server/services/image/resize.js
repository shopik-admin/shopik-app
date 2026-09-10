import sharp from 'sharp'
import { IMAGE_SIZES } from './constants.js'

// serial:true processes sizes one at a time (lower peak memory on small
// boxes). Default parallel preserves existing behavior (Comax flow).
// Each size is a bounding box (width x height with fit:inside), not just a
// width cap — tall portrait sources otherwise keep their full height
// (e.g. a 500px-wide supplier shot producing a 500x1770 'm').
export default async function resize(buffer, sizes = IMAGE_SIZES, { serial = false } = {}) {
    const basePipeline = sharp(buffer)
    const runOne = async ([name, width]) => {
        const data = await basePipeline
            .clone()
            .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer()
        return [name, data]
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