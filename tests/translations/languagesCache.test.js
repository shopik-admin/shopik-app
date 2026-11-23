import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getLanguagesWithCounts } from '../../server/utils/texts/dictionary.js'

describe('translation language list cache', () => {
    it('reads the dictionary collection once for repeated language requests', async () => {
        let dictionaryReads = 0
        const store = new Map()
        const DL = {
            redis: {
                status: 'ready',
                async get(key) {
                    if (key === 'tr:version') return '7'
                    return store.get(key) || null
                },
                async set(key, value) {
                    store.set(key, value)
                    return 'OK'
                }
            },
            TranslationLanguage: {
                async read() {
                    return [{ code: 'en', name: 'english', nativeName: 'English', direction: 'ltr' }]
                }
            },
            TranslationDictionary: {
                async read() {
                    dictionaryReads++
                    return [{ languageCode: 'en', texts: { a: 'A', b: 'B' } }]
                }
            }
        }

        const first = await getLanguagesWithCounts(DL)
        const second = await getLanguagesWithCounts(DL)

        assert.equal(dictionaryReads, 1)
        assert.deepEqual(second, first)
        assert.equal(first.find(language => language.code === 'en').textCount, 2)
    })
})
