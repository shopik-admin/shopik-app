export default function safeJsonParse(str) {
    if (typeof str !== 'string') return null
    try { return JSON.parse(str) } catch { return null }
}

export function parseArray(arr) {
    const rawJsonStrings = arr.filter(Boolean)
    if (rawJsonStrings.length === 0) return []

    const jsonArrayString = `[${rawJsonStrings.join(',')}]`
    return safeJsonParse(jsonArrayString) ?? []
}