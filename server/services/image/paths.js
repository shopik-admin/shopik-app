import path from 'path'

export function buildObjectPath(productId, size, key = '') {
    // Main image keeps the legacy flat path (client builds it directly);
    // alternates live under a keyed subfolder.
    return key
        ? path.posix.join('images', 'products', productId, key, `${size}.webp`)
        : path.posix.join('images', 'products', productId, `${size}.webp`)
}

export function buildDisplayObjectPath(blockId, slideKey, size) {
    return path.posix.join('images', 'display-blocks', blockId, slideKey, `${size}.webp`)
}

export function buildUrl(productId, size, key = '') {
    const base = (process.env.FILES_BASE_URL || '').replace(/\/+$/, '')
    return `${base}/${buildObjectPath(productId, size, key)}`
}