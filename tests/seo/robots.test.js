import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import registerRobotsRoute from '../../server/routes/robots.js'

function get(port, path, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = http.get({ hostname: '127.0.0.1', port, path, headers }, res => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', chunk => { body += chunk })
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
        })
        req.on('error', reject)
    })
}

async function withRobots(run) {
    const app = express()
    registerRobotsRoute(app)
    const server = app.listen(0)
    await new Promise(resolve => server.once('listening', resolve))
    try {
        await run(server.address().port)
    } finally {
        await new Promise(resolve => server.close(resolve))
    }
}

describe('robots.txt', () => {
    it('allows crawling and points at the host sitemap', async () => {
        await withRobots(async port => {
            const res = await get(port, '/robots.txt', { host: 'shefa.click' })
            assert.equal(res.status, 200)
            assert.match(res.headers['content-type'], /text\/plain/)
            assert.match(res.body, /User-agent: \*/)
            assert.match(res.body, /Allow: \//)
            assert.match(res.body, /Sitemap: https:\/\/shefa\.click\/sitemap\.xml/)
        })
    })

    it('never disallows: a blocked crawler cannot read the noindex opt-out', async () => {
        await withRobots(async port => {
            const res = await get(port, '/robots.txt', { host: 'shopik.co.il' })
            assert.doesNotMatch(res.body, /Disallow/)
        })
    })

    it('omits the sitemap line when the Host is not a real hostname', async () => {
        await withRobots(async port => {
            const res = await get(port, '/robots.txt', { host: 'localhost' })
            assert.doesNotMatch(res.body, /Sitemap:/)
            assert.match(res.body, /Allow: \//)
        })
    })
})
