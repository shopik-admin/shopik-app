import download from './download.js'
import resize from './resize.js'
import upload from './upload.js'

export default async function processImage({ productId, sourceUrl }) {
    const source = await download(sourceUrl)
    const sizes = await resize(source)
    return upload({ productId, sizes })
}