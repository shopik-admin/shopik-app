import ExcelJS from 'exceljs'
import { Readable } from 'node:stream'
import buildXlsx from '#server/reports/xlsx.js'
import { BASE_LANGUAGE_CODE } from '#common/constants/translations.js'
import { translationKey, translationValue } from '#server/utils/texts/validate.js'

const MAX_ROWS = 5000
const MAX_FILE_BYTES = 5 * 1024 * 1024

const CONTENT_TYPES = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv;charset=utf-8'
}

function dateStamp() {
    return new Date().toISOString().slice(0, 10)
}

function columnsFor({ allLanguages, code, languages }) {
    const selected = allLanguages
        ? languages
        : languages.filter(language => language.code === BASE_LANGUAGE_CODE || language.code === code)

    return [
        { key: 'key', text: 'key', width: 44, align: 'left', asText: true },
        ...selected.map(language => ({
            key: language.code,
            text: language.code,
            width: 42,
            align: language.direction === 'ltr' ? 'left' : 'right',
            wrap: true
        }))
    ]
}

function valueFor(entry, languageCode) {
    if (languageCode === BASE_LANGUAGE_CODE)
        return entry.effective[BASE_LANGUAGE_CODE] || ''
    return entry.values[languageCode] || ''
}

function rowsFor(entries, columns) {
    return entries.map(entry => columns.map(column =>
        column.key === 'key' ? entry.key : valueFor(entry, column.key)
    ))
}

function csvCell(value) {
    const text = value == null ? '' : String(value)
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(columns, rows) {
    return '\uFEFF' + [
        columns.map(column => csvCell(column.text)).join(','),
        ...rows.map(row => row.map(csvCell).join(','))
    ].join('\r\n')
}

export async function buildTranslationFile({ entries, languages, code = BASE_LANGUAGE_CODE, allLanguages = false, format = 'xlsx' }) {
    const columns = columnsFor({ allLanguages, code, languages })
    const rows = rowsFor(entries, columns)
    const ext = format === 'csv' ? 'csv' : 'xlsx'
    const filename = `translations-${allLanguages ? 'all' : code}-${dateStamp()}.${ext}`

    if (ext === 'csv') {
        return {
            filename,
            contentType: CONTENT_TYPES.csv,
            buffer: Buffer.from(toCsv(columns, rows), 'utf8')
        }
    }

    const selectedLanguage = languages.find(language => language.code === code)

    return {
        filename,
        contentType: CONTENT_TYPES.xlsx,
        buffer: await buildXlsx({
            columns,
            rows,
            sheetName: 'Texts',
            rtl: allLanguages || selectedLanguage?.direction !== 'ltr'
        })
    }
}

function cellText(cell) {
    if (!cell) return ''
    if (typeof cell.text === 'string') return cell.text
    const value = cell.value
    if (value == null) return ''
    if (typeof value === 'object') {
        if (Array.isArray(value.richText))
            return value.richText.map(part => part.text || '').join('')
        if (value.result != null) return String(value.result)
        if (value.text != null) return String(value.text)
    }
    return String(value)
}

function headerIndex(row) {
    const index = new Map()
    row.eachCell({ includeEmpty: false }, (cell, col) => {
        const text = cellText(cell).trim().toLowerCase()
        if (text && !index.has(text)) index.set(text, col)
    })
    return index
}

function targetColumn(headers, languageCode, languages) {
    const direct = headers.get(languageCode.toLowerCase())
    if (direct) return direct

    const language = languages.find(item => item.code === languageCode)
    const names = [language?.name, language?.nativeName, 'value', 'text', 'translation', 'תרגום', 'ערך']
        .filter(Boolean)
        .map(value => String(value).toLowerCase())

    for (const name of names) {
        const col = headers.get(name)
        if (col) return col
    }

    return null
}

const ZIP_SIGNATURE = [0x50, 0x4b]
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0]
const UTF16LE_BOM = [0xff, 0xfe]
const UTF16BE_BOM = [0xfe, 0xff]

function startsWith(buffer, bytes) {
    return bytes.every((byte, index) => buffer[index] === byte)
}

// The extension is not reliable: browsers and mail clients rename downloads,
// and users often save an xlsx export as ".csv" (or the other way around).
// Sniffing the signature avoids feeding one format to the wrong parser.
function detectFormat(buffer) {
    if (startsWith(buffer, ZIP_SIGNATURE)) return 'xlsx'
    if (startsWith(buffer, OLE_SIGNATURE)) return 'xls'
    return 'text'
}

function decodeTextFile(buffer) {
    if (startsWith(buffer, UTF16LE_BOM))
        return new TextDecoder('utf-16le').decode(buffer.subarray(2))
    if (startsWith(buffer, UTF16BE_BOM))
        return new TextDecoder('utf-16be').decode(buffer.subarray(2))

    if (buffer.subarray(0, 512).includes(0))
        throw { status: 400, message: 'the file is not a supported spreadsheet; use .xlsx or .csv' }

    const text = buffer.toString('utf8').replace(/^\uFEFF/, '')
    if (!text.includes('\uFFFD')) return text

    // Excel on a Hebrew Windows still saves plain "CSV" as windows-1255.
    try {
        return new TextDecoder('windows-1255').decode(buffer)
    } catch {
        return text
    }
}

export async function parseTranslationFile({ buffer, filename, languageCode, languages = [] }) {
    if (!Buffer.isBuffer(buffer) || !buffer.length)
        throw { status: 400, message: 'empty file' }
    if (buffer.length > MAX_FILE_BYTES)
        throw { status: 400, message: 'file is larger than 5MB' }

    const format = detectFormat(buffer)
    if (format === 'xls')
        throw { status: 400, message: 'legacy .xls files are not supported; save the file as .xlsx or .csv' }

    const workbook = new ExcelJS.Workbook()

    if (format === 'xlsx') {
        try {
            await workbook.xlsx.load(buffer)
        } catch {
            // ExcelJS throws internals such as "Cannot read properties of
            // undefined (reading 'sheets')" for zips that are not workbooks.
            throw { status: 400, message: `"${filename || 'file'}" is not a valid .xlsx workbook; save it again as .xlsx or .csv` }
        }
    } else {
        try {
            await workbook.csv.read(Readable.from([decodeTextFile(buffer)]))
        } catch (error) {
            if (error?.status) throw error
            throw { status: 400, message: `"${filename || 'file'}" is not a valid .csv file` }
        }
    }

    const sheet = workbook.worksheets[0]
    if (!sheet)
        throw { status: 400, message: `"${filename || 'file'}" has no worksheet; expected a sheet whose first row has a "key" column` }

    const headerRow = sheet.getRow(1)
    const headers = headerIndex(headerRow)
    const keyCol = headers.get('key') || headers.get('מפתח')
    if (!keyCol)
        throw { status: 400, message: 'missing "key" column' }

    const valueCol = targetColumn(headers, languageCode, languages)
    if (!valueCol)
        throw { status: 400, message: `missing "${languageCode}" column (found: ${[...headers.keys()].join(', ')})` }

    const updates = {}
    const errors = []
    let rows = 0
    let skipped = 0

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
        const row = sheet.getRow(rowNumber)
        const rawKey = cellText(row.getCell(keyCol)).trim()
        const rawValue = cellText(row.getCell(valueCol))

        if (!rawKey && !rawValue.trim()) continue
        if (++rows > MAX_ROWS)
            throw { status: 400, message: `import is limited to ${MAX_ROWS} rows` }

        if (!rawValue.trim()) {
            skipped++
            continue
        }

        try {
            const key = translationKey(rawKey)
            const value = translationValue(rawValue)
            if (Object.prototype.hasOwnProperty.call(updates, key)) {
                errors.push({ row: rowNumber, key, message: 'duplicate key (last occurrence wins)' })
            }
            updates[key] = value
        } catch (error) {
            errors.push({ row: rowNumber, key: rawKey, message: error?.message || 'invalid row' })
        }
    }

    return { updates, errors, rows, skipped }
}

export { MAX_FILE_BYTES, MAX_ROWS }
