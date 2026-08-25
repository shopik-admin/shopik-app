export default function toSlug(text = '') {
    return String(text)
        .trim()
        .toLowerCase()
        .replace(/[\u0591-\u05C7]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
}
