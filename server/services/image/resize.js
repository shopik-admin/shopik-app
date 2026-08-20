import sharp from 'sharp'
import { IMAGE_SIZES } from './constants.js'

export default async function resize(buffer) {
    const entries = await Promise.all(
        Object.entries(IMAGE_SIZES).map(async ([name, width]) => {
            const data = await sharp(buffer)
                .rotate()
                .resize({ width, withoutEnlargement: true })
                .webp({ quality: 80 })
                .toBuffer()
            return [name, data]
        })
    )
    return Object.fromEntries(entries)
}