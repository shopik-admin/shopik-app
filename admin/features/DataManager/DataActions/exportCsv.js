const dateFormatter = new Intl.DateTimeFormat('he', { day: '2-digit', month: '2-digit', year: '2-digit' })
const timeFormatter = new Intl.DateTimeFormat('he', { hour: '2-digit', minute: '2-digit', hour12: false })

function getValue(name, row) {
    return name.split('.').reduce((obj, key) => obj?.[key], row)
}

function number(v, d) {
    if (v === undefined || v === null || isNaN(Number(v))) return ''
    const numStr = d !== undefined ? Number(v).toFixed(d) : String(Number(v))
    return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function formatDate(v, includeTime) {
    if (!v) return ''
    const dateObj = new Date(v)
    if (isNaN(dateObj.getTime())) return ''
    const datePart = dateFormatter.format(dateObj).replace(/\./g, '/')
    return includeTime ? `${datePart}, ${timeFormatter.format(dateObj)}` : datePart
}

function formatValue(col, row) {
    const value = getValue(col.key, row)
    if (value === undefined || value === null) return ''

    switch (col.type) {
        case 'date': return formatDate(value, false)
        case 'datetime': return formatDate(value, true)
        case 'coin': return `₪${number(value, 2)}`
        case 'ms': return `${number(value, 2)} ms`
        case 'number': return number(value)
        case 'percent': return `${number(value, 2)}%`
        case 'boolean': return value ? '✓' : '✗'
        case 'name': return `${value?.first || ''} ${value?.last || ''}`.trim()
        default:
            if (typeof value === 'object') {
                try { return JSON.stringify(value) } catch { return '' }
            }
            return String(value)
    }
}

function escapeCell(value) {
    const s = String(value)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Builds a CSV file from table cols/rows and triggers a browser download.
 *
 * @param {Array} cols - Table column definitions (render-only/action columns are skipped)
 * @param {Array} rows - Row objects (the current query result)
 * @param {string} filename - Download filename
 * @param {Function} [TR] - Translation function for headers (defaults to identity)
 */
export default function downloadCsv(cols = [], rows = [], filename = 'export.csv', TR = key => key) {
    const exportCols = cols.filter(col => col.key && col.key !== ' ')
    const header = exportCols.map(col => escapeCell(TR(col.text || col.key))).join(',')
    const body = (rows || [])
        .map(row => exportCols.map(col => escapeCell(formatValue(col, row))).join(','))
        .join('\r\n')

    // \uFEFF BOM so Excel renders Hebrew correctly
    const blob = new Blob(['\uFEFF' + header + '\r\n' + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
}
