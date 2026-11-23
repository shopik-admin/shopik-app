import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import TR, { configureTexts, getTextConfig } from '../../common/texts/TR.js'
import hebrewTexts from '../../common/texts/hebrew.json' with { type: 'json' }

const initial = getTextConfig()

afterEach(() => configureTexts(initial))

describe('TR layers', () => {
    it('falls back to hebrew.json when no override exists', () => {
        configureTexts({ code: 'he', direction: 'rtl', texts: {}, fallback: {} })
        assert.equal(TR('action_add'), hebrewTexts.texts.action_add)
    })

    it('uses the active language before the Hebrew override and the base', () => {
        configureTexts({
            code: 'en',
            direction: 'ltr',
            texts: { action_add: 'Add' },
            fallback: { action_edit: 'Edit (he override)' }
        })
        assert.equal(TR('action_add'), 'Add')
        assert.equal(TR('action_edit'), 'Edit (he override)')
        assert.equal(TR('action_remove'), hebrewTexts.texts.action_remove)
    })

    it('does not let an empty override hide the base text', () => {
        configureTexts({
            code: 'en',
            direction: 'ltr',
            texts: { action_add: '' },
            fallback: {}
        })
        assert.equal(TR('action_add'), hebrewTexts.texts.action_add)
    })

    it('keeps interpolation and the literal-key fallback', () => {
        configureTexts({
            code: 'en',
            direction: 'ltr',
            texts: { 'hello [name]': 'Hello [name]' },
            fallback: {}
        })
        assert.equal(TR('hello [name]', { name: 'Dana' }), 'Hello Dana')
        assert.equal(TR('not_a_real_key_xyz'), 'not_a_real_key_xyz')
    })

    it('reports the configured direction', () => {
        const config = configureTexts({ code: 'en', direction: 'ltr', texts: {} })
        assert.equal(config.code, 'en')
        assert.equal(config.direction, 'ltr')
    })
})
