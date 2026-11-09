import { FLAGS_HEADER } from '../constants/categoryFlags.js'

const csvCell = value => {
    const text = String(value ?? '')
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * A ready-to-fill flags CSV: the required header row plus one sample row.
 * The sample code is deliberately non-numeric, so the parser skips it if the
 * user forgets to replace it. The description columns are left empty — only
 * `קוד`, `הצגת קטגוריה` and `חובה כשרות` are read by the importer.
 */
export function buildFlagsTemplate() {
    const header = FLAGS_HEADER.map(csvCell).join(',')
    const sample = [
        ...Array(FLAGS_HEADER.length - 3).fill(''),
        'דוגמה',
        'TRUE',
        'FALSE'
    ].map(csvCell).join(',')

    return `${header}\r\n${sample}\r\n`
}
