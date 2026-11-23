import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import hebrewTexts from '../../common/texts/hebrew.json' with { type: 'json' }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// Every module that shows push copy. Scanning the sources (instead of keeping a
// second list of keys in sync) is what makes a typo fail the build, not the UI.
const SOURCES = [
    'admin/components/NotificationBell/index.jsx',
    'admin/features/Push/index.jsx',
    'common/functions/pushClient.js',
    'server/utils/data/adminPush.js',
    'server/api/push/test.js'
]

function usedKeys() {
    const keys = new Set()
    for (const file of SOURCES) {
        const source = readFileSync(path.join(root, file), 'utf8')
        for (const match of source.matchAll(/['"`](push_[a-z0-9_]+)['"`]/g)) keys.add(match[1])
    }
    return keys
}

describe('push notification copy', () => {
    it('lives in the base dictionary and is never empty', () => {
        const keys = usedKeys()
        assert.ok(keys.size >= 35, `expected the push copy to be keyed, found ${keys.size}`)

        const missing = [...keys].filter(key => {
            const value = hebrewTexts.texts[key]
            return typeof value !== 'string' || value.trim() === ''
        })
        assert.deepEqual(missing, [])
    })

    it('keeps interpolation placeholders in the dictionary', () => {
        for (const key of ['push_time_minutes', 'push_time_hours', 'push_time_days', 'push_window_ready_count'])
            assert.match(hebrewTexts.texts[key], /\[count\]/, key)
    })
})
