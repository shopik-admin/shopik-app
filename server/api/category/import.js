import { applyCategoryMap } from '#server/services/categoryMap/index.js'

const MAX_BYTES = 5 * 1024 * 1024

function decodeCsv({ csvText, csvBase64 }) {
    if (typeof csvText === 'string' && csvText.trim()) return csvText
    if (typeof csvBase64 !== 'string' || !csvBase64.trim())
        throw { status: 400, message: 'csvBase64 required' }

    const payload = csvBase64.startsWith('data:')
        ? csvBase64.slice(csvBase64.indexOf(',') + 1)
        : csvBase64
    const buffer = Buffer.from(payload, 'base64')
    if (!buffer.length) throw { status: 400, message: 'invalid CSV file' }
    if (buffer.length > MAX_BYTES) throw { status: 400, message: 'CSV file is too large' }
    return buffer.toString('utf8')
}

// Upload a category-map CSV and replace the ENTIRE category tree + map.
export default async function importCategories(payload, { DL }) {
    const csvText = decodeCsv(payload)
    return applyCategoryMap({
        DL,
        csvText,
        filename: payload.filename ? String(payload.filename).slice(0, 200) : null
    })
}

importCategories.config = {
    permissions: ['category:update'],
    preventMultiple: true
}
