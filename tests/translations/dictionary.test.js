import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import hebrewTexts from '../../common/texts/hebrew.json' with { type: 'json' }
import { getTranslationRows, getTranslations } from '../../server/utils/texts/dictionary.js'

const languages = [
    { code: 'en', name: 'english', nativeName: 'English', direction: 'ltr' }
]

const dictionaries = [
    { languageCode: 'he', texts: { action_add: 'הוספה מותאמת' } },
    { languageCode: 'en', texts: { action_add: 'Add', custom_key: 'Custom' } }
]

const DL = {
    TranslationLanguage: {
        async read() { return languages },
        async readOne(filter) {
            if (filter.code === 'he') return null
            return languages.find(language => language.code === filter.code) || null
        }
    },
    TranslationDictionary: {
        async read() { return dictionaries },
        async readOne(filter) {
            return dictionaries.find(dictionary => dictionary.languageCode === filter.languageCode) || null
        }
    }
}

describe('translation dictionary', () => {
    it('returns language overrides and Hebrew fallbacks without shipping the base map', async () => {
        const en = await getTranslations(DL, 'en')
        assert.equal(en.code, 'en')
        assert.equal(en.direction, 'ltr')
        assert.equal(en.texts.action_add, 'Add')
        assert.equal(en.fallback.action_add, 'הוספה מותאמת')
    })

    it('returns Hebrew overrides as the active layer for he', async () => {
        const he = await getTranslations(DL, 'he')
        assert.equal(he.code, 'he')
        assert.equal(he.direction, 'rtl')
        assert.equal(he.texts.action_add, 'הוספה מותאמת')
        assert.deepEqual(he.fallback, {})
    })

    it('pivots dictionaries into one row per key with raw values and effective values', async () => {
        const rows = await getTranslationRows(DL)
        const row = rows.entries.find(entry => entry.key === 'action_add')
        assert.ok(row)
        assert.equal(row.values.he, 'הוספה מותאמת')
        assert.equal(row.values.en, 'Add')
        assert.equal(row.effective.he, 'הוספה מותאמת')
        assert.equal(row.effective.en, 'Add')

        const custom = rows.entries.find(entry => entry.key === 'custom_key')
        assert.ok(custom)
        assert.equal(custom.base, '')
        assert.equal(custom.custom, true)
        assert.equal(custom.effective.en, 'Custom')
    })

    it('counts missing translations against the Hebrew effective dictionary', async () => {
        const rows = await getTranslationRows(DL)
        const en = rows.stats.find(item => item.code === 'en')
        assert.ok(en.overrides >= 2)
        assert.ok(en.missing > 0)
        assert.ok(rows.entries.length >= Object.keys(hebrewTexts.texts).length)
    })
})
