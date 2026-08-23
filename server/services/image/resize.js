import sharp from 'sharp'
import { IMAGE_SIZES } from './constants.js'

export default async function resize(buffer) {
    const basePipeline = sharp(buffer)
    const entries = await Promise.all(
        Object.entries(IMAGE_SIZES).map(async ([name, width]) => {
            const data = await basePipeline
                .clone()
                .resize({ width, withoutEnlargement: true })
                .webp({ quality: 80 })
                .toBuffer()
            return [name, data]
        })
    )
    return Object.fromEntries(entries)
}