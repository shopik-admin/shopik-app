import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildTranslationFile, parseTranslationFile } from '../../server/utils/texts/spreadsheet.js'

const languages = [
    { code: 'he', name: 'hebrew', nativeName: 'עברית', direction: 'rtl' },
    { code: 'en', name: 'english', nativeName: 'English', direction: 'ltr' }
]

const entries = [
    {
        key: 'hello',
        base: 'שלום',
        values: { he: '', en: 'Hi' },
        effective: { he: 'שלום', en: 'Hi' }
    },
    {
        key: 'multi',
        base: 'שורה\nשנייה',
        values: { he: '', en: 'Line one,\nline two' },
        effective: { he: 'שורה\nשנייה', en: 'Line one,\nline two' }
    }
]

async function roundTrip(format) {
    const file = await buildTranslationFile({
        entries,
        languages,
        code: 'en',
        allLanguages: false,
        format
    })
    return parseTranslationFile({
        buffer: file.buffer,
        filename: file.filename,
        languageCode: 'en',
        languages
    })
}

describe('translation spreadsheet', () => {
    it('exports and imports CSV with BOM and multiline values', async () => {
        const parsed = await roundTrip('csv')
        assert.equal(parsed.errors.length, 0)
        assert.equal(parsed.updates.hello, 'Hi')
        assert.equal(parsed.updates.multi, 'Line one,\nline two')
    })

    it('exports and imports xlsx', async () => {
        const parsed = await roundTrip('xlsx')
        assert.equal(parsed.errors.length, 0)
        assert.equal(parsed.updates.hello, 'Hi')
        assert.equal(parsed.updates.multi, 'Line one,\nline two')
    })

    it('skips empty target cells and reports the skipped count', async () => {
        const csv = 'key,en\r\nhello,Hi\r\nbye,\r\n'
        const parsed = await parseTranslationFile({
            buffer: Buffer.from(csv, 'utf8'),
            filename: 'texts.csv',
            languageCode: 'en',
            languages
        })
        assert.deepEqual(parsed.updates, { hello: 'Hi' })
        assert.equal(parsed.skipped, 1)
    })

    it('rejects a file without the target language column', async () => {
        await assert.rejects(
            () => parseTranslationFile({
                buffer: Buffer.from('key,he\r\nhello,שלום\r\n', 'utf8'),
                filename: 'texts.csv',
                languageCode: 'en',
                languages
            }),
            error => /missing "en" column/.test(error?.message)
        )
    })

    it('parses CSV content even when the file is named .xlsx', async () => {
        const parsed = await parseTranslationFile({
            buffer: Buffer.from('key,en\r\nhello,Hi\r\n', 'utf8'),
            filename: 'texts.xlsx',
            languageCode: 'en',
            languages
        })
        assert.deepEqual(parsed.updates, { hello: 'Hi' })
    })

    it('parses xlsx content even when the file is named .csv', async () => {
        const file = await buildTranslationFile({
            entries,
            languages,
            code: 'en',
            allLanguages: false,
            format: 'xlsx'
        })
        const parsed = await parseTranslationFile({
            buffer: file.buffer,
            filename: 'texts.csv',
            languageCode: 'en',
            languages
        })
        assert.equal(parsed.updates.hello, 'Hi')
    })

    it('reads UTF-16 and windows-1255 CSV files saved by Excel', async () => {
        const utf16 = Buffer.concat([
            Buffer.from([0xff, 0xfe]),
            Buffer.from('key,en\r\nhello,Hi\r\n', 'utf16le')
        ])
        const parsedUtf16 = await parseTranslationFile({
            buffer: utf16,
            filename: 'texts.csv',
            languageCode: 'en',
            languages
        })
        assert.deepEqual(parsedUtf16.updates, { hello: 'Hi' })

        // "שלום" as windows-1255 bytes, which is what plain CSV export on a
        // Hebrew Windows produces.
        const cp1255 = Buffer.concat([
            Buffer.from('key,en\r\nhello,', 'latin1'),
            Buffer.from([0xf9, 0xec, 0xe5, 0xed])
        ])
        const parsedCp1255 = await parseTranslationFile({
            buffer: cp1255,
            filename: 'texts.csv',
            languageCode: 'en',
            languages
        })
        assert.deepEqual(parsedCp1255.updates, { hello: 'שלום' })
    })

    it('rejects legacy .xls files with a readable message', async () => {
        await assert.rejects(
            () => parseTranslationFile({
                buffer: Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(512)]),
                filename: 'texts.xls',
                languageCode: 'en',
                languages
            }),
            error => error.status === 400 && /legacy \.xls/.test(error.message)
        )
    })

    it('turns broken workbooks into a friendly error instead of a parser crash', async () => {
        const file = await buildTranslationFile({
            entries,
            languages,
            code: 'en',
            allLanguages: false,
            format: 'xlsx'
        })

        await assert.rejects(
            () => parseTranslationFile({
                buffer: file.buffer.subarray(0, 200),
                filename: 'texts.xlsx',
                languageCode: 'en',
                languages
            }),
            error => error.status === 400
                && /not a valid \.xlsx workbook/.test(error.message)
                && !/sheets/.test(error.message)
        )

        // A valid zip that simply is not an Excel workbook (this is the case
        // that used to surface ExcelJS's "reading 'sheets'" crash).
        const emptyZip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(18)])
        await assert.rejects(
            () => parseTranslationFile({
                buffer: emptyZip,
                filename: 'texts.xlsx',
                languageCode: 'en',
                languages
            }),
            error => error.status === 400 && /has no worksheet/.test(error.message)
        )
    })
})
