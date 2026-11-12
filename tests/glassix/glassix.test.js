import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { GLASSIX_ORIGINS, glassixScriptUrl, resolveGlassixConfig } from '../../common/functions/glassix.js'

const ENABLED = { enabled: 'true', apiKey: 'af593518-baca-4879-801d-76c9ee722c04', snippetId: 'Xn4S3IA2I1r4OPFS3WmI' }
const settings = (glassix) => ({ integrations: { glassix } })

describe('resolveGlassixConfig', () => {
    it('returns the credentials for a fully configured domain', () => {
        assert.deepEqual(resolveGlassixConfig(settings(ENABLED)), {
            apiKey: 'af593518-baca-4879-801d-76c9ee722c04',
            snippetId: 'Xn4S3IA2I1r4OPFS3WmI'
        })
    })

    it('returns null when the setting is absent or malformed', () => {
        assert.equal(resolveGlassixConfig(undefined), null)
        assert.equal(resolveGlassixConfig({}), null)
        assert.equal(resolveGlassixConfig({ integrations: {} }), null)
        assert.equal(resolveGlassixConfig(settings('')), null)
        assert.equal(resolveGlassixConfig(settings(null)), null)
        assert.equal(resolveGlassixConfig(settings(['enabled'])), null)
    })

    it('treats every non-truthy enabled flag as off', () => {
        for (const enabled of [undefined, false, 'false', '0', '', 'no', 'on']) {
            assert.equal(resolveGlassixConfig(settings({ ...ENABLED, enabled })), null, `enabled=${String(enabled)}`)
        }
    })

    // ConfigEditor re-stringifies the whole config on save, so a real boolean
    // only survives until the first admin edit.
    it('accepts the boolean and string forms of enabled', () => {
        for (const enabled of [true, 'true', 1, '1']) {
            assert.ok(resolveGlassixConfig(settings({ ...ENABLED, enabled })), `enabled=${String(enabled)}`)
        }
    })

    it('returns null for a half-filled config', () => {
        assert.equal(resolveGlassixConfig(settings({ enabled: 'true', snippetId: 'Xn4S3IA2I1r4OPFS3WmI' })), null)
        assert.equal(resolveGlassixConfig(settings({ enabled: 'true', apiKey: 'af593518' })), null)
        assert.equal(resolveGlassixConfig(settings({ ...ENABLED, apiKey: '   ' })), null)
        assert.equal(resolveGlassixConfig(settings({ ...ENABLED, snippetId: '   ' })), null)
        assert.equal(resolveGlassixConfig(settings({ enabled: 'true', apiKey: 123, snippetId: {} })), null)
    })

    it('trims the credentials', () => {
        assert.deepEqual(
            resolveGlassixConfig(settings({ enabled: 'true', apiKey: ' key ', snippetId: ' snippet ' })),
            { apiKey: 'key', snippetId: 'snippet' }
        )
    })

    it('lists the primary host before its onerror fallback', () => {
        assert.deepEqual(GLASSIX_ORIGINS, ['https://cdn.glassix.com', 'https://cdn.glassix.net'])
    })

    it('builds the script URL the vendor snippet uses', () => {
        assert.equal(glassixScriptUrl(GLASSIX_ORIGINS[0]), 'https://cdn.glassix.com/clients/widget.1.2.min.js')
        assert.equal(glassixScriptUrl(GLASSIX_ORIGINS[1]), 'https://cdn.glassix.net/clients/widget.1.2.min.js')
    })
})
