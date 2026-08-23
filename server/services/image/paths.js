import path from 'path'

export function buildObjectPath(productId, size) {
    return path.posix.join('images', 'products', productId, `${size}.webp`)
}

export function buildUrl(productId, size) {
    const base = (process.env.FILES_BASE_URL || '').replace(/\/+$/, '')
    return `${base}/${buildObjectPath(productId, size)}`
}