import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { PUSH_ICONS, pushIconsFor } from '../../server/utils/data/adminPush.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ADMIN_PUBLIC = path.join(ROOT, 'admin', 'public')

describe('push notification icons', () => {
    it('ships a monochrome badge (Android status bar)', async () => {
        const file = path.join(ADMIN_PUBLIC, PUSH_ICONS.badge.replace(/^\/+/, ''))
        assert.ok(existsSync(file), `missing ${PUSH_ICONS.badge}`)

        const metadata = await sharp(file).metadata()
        assert.equal(metadata.format, 'png')
        assert.equal(metadata.width, 96)
        assert.equal(metadata.height, 96)

        // Android draws the badge from its alpha channel only; a fully opaque
        // image (like the app icon) would render as a solid square.
        const stats = await sharp(file).stats()
        assert.equal(stats.channels[3].min, 0)
        assert.equal(stats.channels[3].max, 255)
    })

    it('uses the uploaded app icon from storage when the domain has one', async () => {
        const DL = {
            Setting: {
                read: async () => [
                    { category: 'appearance', key: 'appIcon', value: 'images/settings/d1/appIcon/v7' }
                ]
            }
        }
        const icons = await pushIconsFor({ DL, domainId: 'd1' })

        assert.match(icons.icon, /images\/settings\/d1\/appIcon\/v7\/192\.png$/)
        assert.equal(icons.badge, PUSH_ICONS.badge)
    })

    it('falls back to the bundled same-origin icon', async () => {
        const icons = await pushIconsFor({ DL: {}, domainId: 'd1' })

        assert.equal(icons.icon, '/icons/app/192.png')
        assert.equal(icons.badge, '/icons/badge-96.png')
    })

    it('serves the app icon from the app origin', () => {
        // The payload points at a route, not a static file, so a domain's
        // uploaded icon is used (and stays same-origin for the browser).
        assert.equal(PUSH_ICONS.icon, '/icons/app/192.png')
        assert.ok(existsSync(path.join(ROOT, 'server', 'routes', 'appIcon.js')))
        assert.match(
            readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8'),
            /registerAppIconRoute\(app, bootData\)/
        )
        // The route's fallback must exist in the shipped admin bundle.
        assert.ok(existsSync(path.join(ADMIN_PUBLIC, 'icons', 'icon-192.png')))
    })

    it('uses the badge (not the app icon) as the service worker fallback', () => {
        const sw = readFileSync(path.join(ADMIN_PUBLIC, 'sw.js'), 'utf8')
        assert.match(sw, /const DEFAULT_BADGE = '\/icons\/badge-96\.png'/)
        assert.match(sw, /badge: data\.badge \|\| DEFAULT_BADGE/)
    })

    it('points the install icon at the per-domain app icon', () => {
        for (const file of ['index.html', path.join('Login', 'login.html')]) {
            const html = readFileSync(path.join(ROOT, 'admin', file), 'utf8')
            assert.match(html, /rel="apple-touch-icon" href="\/icons\/app\/180\.png"/)
            assert.match(html, /rel="icon"[^>]*href="\/icons\/app\/192\.png"/)
        }
    })
})
