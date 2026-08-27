import { useText } from 'common/texts/TextProvider'

const dateFormatter = new Intl.DateTimeFormat('he', { day: '2-digit', month: '2-digit', year: '2-digit' })
const timeFormatter = new Intl.DateTimeFormat('he', { hour: '2-digit', minute: '2-digit', hour12: false })

const _number = (v, d) => {
    if (v === undefined || v === null || isNaN(Number(v))) return ''
    const numStr = d !== undefined ? Number(v).toFixed(d) : String(Number(v))
    return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const _date = (v, includeTime) => {
    if (!v) return ''
    const dateObj = new Date(v)
    if (isNaN(dateObj.getTime())) return ''
    const datePart = dateFormatter.format(dateObj).replace(/\./g, '/')
    return includeTime ? `${datePart} ${timeFormatter.format(dateObj)}` : datePart
}

/**
 * Formats data types into user-friendly strings.
 * 
 * @param {Object} options
 * @param {('name'|'date'|'datetime'|'coin'|'number'|'percent'|'boolean')} options.type - Data format type
 * @param {*} options.value - The value to format
 * @param {string} [options.sign='₪'] - Currency sign (used only for 'coin' type)
 * @returns {string} Formatted string
 */
export default function render({ type, value, ...props } = {}) {
    const { TR } = useText()
    if (value === undefined || value === null) return ''

    switch (type) {
        case 'tr':
            return TR(value)
        case 'name':
            return `${value?.first || ''} ${value?.last || ''}`.trim()
        case 'date':
            return _date(value, false)
        case 'datetime':
            return _date(value, true)
        case 'ms':
            return `${_number(value, 2)} ms`
        case 'address':
            if (!value) return ''
            return `${value.street || ''} ${value.building || ''}${value.apartment ? `, דירה ${value.apartment}` : ''}, ${value.city || ''}`.trim().replace(/^,|,$/g, '')
        case 'coin':
            return `${props.sign || '₪'}${_number(value, 2)}`
        case 'number':
            return _number(value)
        case 'percent':
            return `${_number(value, 2)}%`
        case 'boolean':
            return value ? '✓' : '✗'
        default:
            if (typeof value === 'object') {
                try {
                    return JSON.stringify(value)
                } catch {
                    return ''
                }
            }
            return String(value)
    }
}