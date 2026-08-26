export default function safeJsonParse(str) {
    if (typeof str !== 'string') return null
    try { return JSON.parse(str) } catch { return null }
}

export function parseArray(arr) {
    if (!Array.isArray(arr)) return []
    return arr.filter(Boolean).reduce((acc, str) => {
        const parsed = safeJsonParse(str)
        if (parsed !== null && parsed !== undefined) acc.push(parsed)
        return acc
    }, [])
}