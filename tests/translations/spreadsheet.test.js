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
})
