export function getProductImageUrl(id, size = 's') {
    if (!id) return ''
    const base = (VITE_FILES_BASE_URL || 'https://files.shopik.co.il').replace(/\/+$/, '')
    return `${base}/images/products/${id}/${size}.webp`
}
