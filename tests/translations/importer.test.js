import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { prepareTranslationImport } from '../../server/utils/texts/importer.js'
import { replaceTranslations } from '../../server/utils/texts/dictionary.js'

const language = { code: 'en', name: 'english', nativeName: 'English', direction: 'ltr' }

function dl(overrides = {}) {
    return {
        TranslationLanguage: {
            async read() { return [language] },
            async readOne(filter) { return filter.code === 'en' ? language : null }
        },
        TranslationDictionary: {
            async read() { return [{ languageCode: 'en', texts: {} }] },
            async readOne() { return { texts: { existing: 'value' }, updatedAt: new Date() } },
            async updateOne() { return { id: 'dict-1', languageCode: 'en', texts: { existing: 'value', next: 'Next' } } },
            ...overrides
        }
    }
}

describe('translation importer', () => {
    it('parses a CSV without writing anything', async () => {
        const csv = 'key,en\r\nhello,Hi\r\nbye,\r\n'
        const prepared = await prepareTranslationImport(dl(), {
            languageCode: 'en',
            filename: 'texts.csv',
            fileBase64: Buffer.from(csv, 'utf8').toString('base64')
        })
        assert.deepEqual(prepared.updates, { hello: 'Hi' })
        assert.equal(prepared.skipped, 1)
    })

    it('shows only values that actually differ from the stored dictionary', async () => {
        const csv = 'key,en\r\nhello,Hi\r\nexisting,value\r\n'
        const prepared = await prepareTranslationImport(dl(), {
            languageCode: 'en',
            filename: 'texts.csv',
            fileBase64: Buffer.from(csv, 'utf8').toString('base64')
        })
        assert.deepEqual(prepared.updates, { hello: 'Hi' })
        assert.equal(prepared.skipped, 1)
    })

    it('treats a returned document as a successful merge (DL.updateOne is not a raw Mongo result)', async () => {
        const result = await replaceTranslations(dl(), 'en', { next: 'Next' })
        assert.equal(result.updated, 1)
        assert.equal(result.languageCode, 'en')
    })
})
