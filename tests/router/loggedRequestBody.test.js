import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { loggedRequestBody, MAX_LOGGED_BODY_BYTES } from '../../server/router.js'

const body = { name: 'a.png', fileBase64: 'x'.repeat(100) }

describe('loggedRequestBody', () => {
    it('keeps small bodies verbatim', () => {
        assert.equal(loggedRequestBody({ 'content-length': '1024' }, body), body)
    })

    it('keeps the body when content-length is absent', () => {
        assert.equal(loggedRequestBody({}, body), body)
    })

    it('replaces an oversized body with its declared size', () => {
        const bytes = MAX_LOGGED_BODY_BYTES + 1
        assert.deepEqual(
            loggedRequestBody({ 'content-length': String(bytes) }, body),
            { omitted: true, bytes }
        )
    })

    it('omits compressed bodies regardless of declared size', () => {
        assert.deepEqual(
            loggedRequestBody({ 'content-encoding': 'gzip', 'content-length': '500' }, body),
            { omitted: true, bytes: 500, encoding: 'gzip' }
        )
    })

    it('treats identity encoding as uncompressed', () => {
        assert.equal(loggedRequestBody({ 'content-encoding': 'identity', 'content-length': '500' }, body), body)
    })
})
