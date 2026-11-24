import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import registerAppIconRoute from '../../server/routes/appIcon.js'

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 65">
    <path fill="#003324" d="M10 10h100v45H10z"/>
</svg>`

function mount(settings = {}) {
    let handler
    const app = { get: (route, fn) => { handler = fn; assert.equal(route, '/icons/app/:file') } }
    registerAppIconRoute(app, {
        DL: {},
        utils: { data: { getSettings: async () => settings } }
    })
    return handler
}

function makeRes() {
    return {
        headers: {},
        statusCode: 200,
        headersSent: false,
        body: undefined,
        setHeader(key, value) { this.headers[key] = value },
        status(code) { this.statusCode = code; return this },
        end() { this.ended = true; return this },
        send(body) { this.body = body; this.headersSent = true; return this },
        redirect(code, url) { this.redirectedTo = { code, url }; return this }
    }
}

describe('app icon route', () => {
    it('falls back to the shipped icon when the domain has no uploaded one', async () => {
        const handler = mount({ appearance: {} })
        const res = makeRes()

        await handler({ params: { file: '192.png' } }, res)

        assert.deepEqual(res.redirectedTo, { code: 302, url: '/icons/icon-192.png' })
        assert.equal(res.headers.Vary, 'Host')
    })

    it('maps every install variant to its shipped fallback', async () => {
        const expected = {
            '192.png': '/icons/icon-192.png',
            '512.png': '/icons/icon-512.png',
            'maskable-512.png': '/icons/maskable-512.png',
            '180.png': '/icons/apple-180.png'
        }
        const handler = mount({})

        for (const [file, url] of Object.entries(expected)) {
            const res = makeRes()
            await handler({ params: { file } }, res)
            assert.deepEqual(res.redirectedTo, { code: 302, url })
        }
    })

    it('rejects anything outside the allow-list', async () => {
        const handler = mount({})
        const res = makeRes()

        await handler({ params: { file: '../../etc/passwd' } }, res)

        assert.equal(res.statusCode, 404)
        assert.equal(res.redirectedTo, undefined)
    })

    it('falls back when settings cannot be read', async () => {
        let handler
        registerAppIconRoute({ get: (route, fn) => { handler = fn } }, {
            DL: {},
            utils: { data: { getSettings: async () => { throw new Error('db down') } } }
        })
        const res = makeRes()

        await handler({ params: { file: '180.png' } }, res)

        assert.deepEqual(res.redirectedTo, { code: 302, url: '/icons/apple-180.png' })
    })

    it('rasterises the domain favicon into a 96px badge PNG', async () => {
        const handler = mount({
            appearance: { favicon: 'images/settings/d1/favicon/v1/Asset-5.svg' }
        })
        const res = makeRes()
        const originalFetch = globalThis.fetch

        try {
            globalThis.fetch = async () => ({
                ok: true,
                arrayBuffer: async () => Buffer.from(FAVICON_SVG)
            })
            await handler({ params: { file: 'badge-96.png' } }, res)
        } finally {
            globalThis.fetch = originalFetch
        }

        assert.equal(res.headers['Content-Type'], 'image/png')
        assert.equal(res.redirectedTo, undefined)

        // A notification badge must be a small PNG the system can tint.
        assert.equal(res.body[0], 0x89)
        assert.equal(res.body.subarray(1, 4).toString(), 'PNG')

        const metadata = await sharp(res.body).metadata()
        assert.equal(metadata.format, 'png')
        assert.equal(metadata.width, 96)
        assert.equal(metadata.height, 96)
    })

    it('falls back to the bell when the domain has no favicon', async () => {
        const handler = mount({ appearance: { favicon: '' } })
        const res = makeRes()

        await handler({ params: { file: 'badge-96.png' } }, res)

        assert.deepEqual(res.redirectedTo, { code: 302, url: '/icons/badge-96.png' })
    })

    it('falls back to the bell when the favicon cannot be fetched', async () => {
        const handler = mount({
            appearance: { favicon: 'images/settings/d1/favicon/v1/missing.svg' }
        })
        const res = makeRes()
        const originalFetch = globalThis.fetch

        try {
            globalThis.fetch = async () => ({ ok: false, status: 404 })
            await handler({ params: { file: 'badge-96.png' } }, res)
        } finally {
            globalThis.fetch = originalFetch
        }

        assert.deepEqual(res.redirectedTo, { code: 302, url: '/icons/badge-96.png' })
    })
})
