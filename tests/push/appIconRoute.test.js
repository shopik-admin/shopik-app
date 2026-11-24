import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import registerAppIconRoute from '../../server/routes/appIcon.js'

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
        setHeader(key, value) { this.headers[key] = value },
        status(code) { this.statusCode = code; return this },
        end() { this.ended = true; return this },
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
})
