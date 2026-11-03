import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildManifest } from '../../server/routes/manifest.js'

describe('buildManifest', () => {
    it('builds a storefront manifest with default icons', () => {
        const manifest = buildManifest({ settings: {} })

        assert.equal(manifest.name, 'Shopik')
        assert.equal(manifest.short_name, 'Shopik')
        assert.equal(manifest.start_url, '/')
        assert.equal(manifest.orientation, 'portrait-primary')
        assert.equal(manifest.lang, 'he')
        assert.equal(manifest.dir, 'rtl')
        assert.equal(manifest.theme_color, '#195855')
        assert.equal(manifest.background_color, '#ffffff')
        assert.deepEqual(
            manifest.icons.map(icon => icon.src),
            ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png']
        )
        assert.ok(manifest.shortcuts?.length)
    })

    it('builds an admin manifest without rotation lock or shortcuts', () => {
        const manifest = buildManifest({
            isAdmin: true,
            settings: { appearance: { siteName: 'Acme' } }
        })

        assert.equal(manifest.name, 'Acme Admin')
        assert.equal(manifest.orientation, 'any')
        assert.equal(manifest.shortcuts, undefined)
        assert.equal(manifest.categories, undefined)
    })

    it('uses uploaded appIcon PNG variants', () => {
        const manifest = buildManifest({
            settings: { appearance: { appIcon: 'images/settings/d1/appIcon/v1' } }
        })

        assert.deepEqual(
            manifest.icons.map(icon => icon.src),
            [
                'https://files.shopik.co.il/images/settings/d1/appIcon/v1/192.png',
                'https://files.shopik.co.il/images/settings/d1/appIcon/v1/512.png',
                'https://files.shopik.co.il/images/settings/d1/appIcon/v1/maskable-512.png'
            ]
        )
        assert.equal(manifest.icons[2].purpose, 'maskable')
    })

    it('reads theme colors stored as plain strings', () => {
        const manifest = buildManifest({
            settings: { theme: { 'header-bg': '#123456', 'bg-primary': '#abcdef' } }
        })

        assert.equal(manifest.theme_color, '#123456')
        assert.equal(manifest.background_color, '#abcdef')
    })

    it('reads theme colors stored as { light, dark } objects', () => {
        const manifest = buildManifest({
            settings: {
                theme: {
                    'header-bg': { light: '#112233', dark: '#000000' },
                    'bg-primary': { light: '#fefefe', dark: '#111111' }
                }
            }
        })

        assert.equal(manifest.theme_color, '#112233')
        assert.equal(manifest.background_color, '#fefefe')
    })

    it('falls back to product-button-bg when header-bg is missing', () => {
        const manifest = buildManifest({
            settings: { theme: { 'product-button-bg': '#445566' } }
        })

        assert.equal(manifest.theme_color, '#445566')
    })

    it('truncates short_name by code points', () => {
        const manifest = buildManifest({
            settings: { appearance: { siteName: 'חנות המשלוחים שלי' } }
        })

        assert.equal(Array.from(manifest.short_name).length, 12)
    })
})
