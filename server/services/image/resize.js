import sharp from 'sharp'
import { IMAGE_SIZES } from './constants.js'

// serial:true processes sizes one at a time (lower peak memory on small
// boxes). Default parallel preserves existing behavior (Comax flow).
// Each size is a bounding box (width x height with fit:inside), not just a
// width cap — tall portrait sources otherwise keep their full height
// (e.g. a 500px-wide supplier shot producing a 500x1770 'm').
export default async function resize(buffer, sizes = IMAGE_SIZES, { serial = false } = {}) {
    // Cap decoded pixels: the upload/GS1 caps bound compressed bytes, not the
    // decoded surface (a 20MB PNG can declare 100MP+). 50MP is well above the
    // largest real source we see (Comax 2560×2560 ≈ 6.6MP).
    const basePipeline = sharp(buffer, { limitInputPixels: 50_000_000 })
    // A null/0 width means "convert to webp only" (full resolution variant),
    // e.g. the seo.ogImage setting which stores just one large image.
    const runOne = async ([name, width]) => {
        let pipeline = basePipeline.clone()
        if (width) {
            pipeline = pipeline.resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
        }
        const data = await pipeline.webp({ quality: 70 }).toBuffer()
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