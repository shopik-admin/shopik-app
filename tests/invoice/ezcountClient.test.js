import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import ezcountFactory, { normalizeDocResponse, scrubSecrets } from '../../server/external/ezcount/index.js'

// The real provider answers HTTP 200 for business errors, so these tests pin
// the contract that used to collapse into "EZcount request failed (HTTP 200)".

const KEY = '4b3878834875fc90b254f53b88337ee4b74084c7bad9a6fef5a0614dbe029fa5'
const CREATED_BY = 'c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1'

const originalFetch = globalThis.fetch

function stubFetch(payload, { status = 200 } = {}) {
    const calls = []
    globalThis.fetch = async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(init.body) })
        return new Response(JSON.stringify(payload), {
            status,
            headers: { 'content-type': 'application/json' }
        })
    }
    return calls
}

afterEach(() => { globalThis.fetch = originalFetch })

function createClient() {
    return ezcountFactory({ DL: {} })
}

describe('normalizeDocResponse', () => {
    it('surfaces errMsg instead of the generic HTTP message', () => {
        const result = normalizeDocResponse({
            errNum: 1,
            errMsg: "'created_by_api_key' is a mandatory key for distributors users",
            success: false
        }, 200)

        assert.equal(result.ok, false)
        assert.match(result.error, /created_by_api_key/)
        assert.doesNotMatch(result.error, /request failed/)
        assert.equal(result.providerCode, 1)
        assert.equal(result.code, 'EZCOUNT_ERROR_1')
    })

    it('treats success:false as a failure even when a doc number is present', () => {
        const result = normalizeDocResponse({
            success: false,
            doc_number: '30012',
            errMsg: 'document was not allocated'
        }, 200)

        assert.equal(result.ok, false)
        assert.equal(result.docNumber, '30012')
    })

    it('falls back to errMsgPretty when errMsg is missing', () => {
        const result = normalizeDocResponse({
            success: false,
            errMsgPretty: ['first reason', 'second reason']
        }, 200)

        assert.equal(result.ok, false)
        assert.match(result.error, /first reason second reason/)
    })

    it('adds an actionable hint for distributor and environment failures', () => {
        const distributor = normalizeDocResponse({
            success: false,
            errMsg: "'created_by_api_key' is a mandatory key for distributors users"
        }, 200)
        assert.match(distributor.error, /distributor key/)

        const mismatch = normalizeDocResponse({
            success: false,
            errMsg: 'your API KEY `x` is not correct for the environment production'
        }, 200)
        assert.match(mismatch.error, /not interchangeable/)
    })

    it('keeps the documented success shape intact', () => {
        const result = normalizeDocResponse({
            success: true,
            doc_number: 30012,
            doc_uuid: '6f1e7a4b-2f1c-4e6a-9d1b-1a2b3c4d5e6f',
            pdf_link: 'https://example.test/doc.pdf',
            sent_mails: ['a@b.c']
        }, 200)

        assert.equal(result.ok, true)
        assert.equal(result.error, undefined)
        assert.equal(result.docNumber, '30012')
        assert.equal(result.docId, '6f1e7a4b-2f1c-4e6a-9d1b-1a2b3c4d5e6f')
        assert.equal(result.docUrl, 'https://example.test/doc.pdf')
    })
})

describe('scrubSecrets', () => {
    it('masks configured secrets, secret-named keys and long hex tokens in messages', () => {
        const scrubbed = scrubSecrets({
            api_key: KEY,
            error: `bad key ${KEY}`,
            raw: { errMsg: `unknown key ${CREATED_BY}`, note: `literal ${KEY}` }
        }, [KEY, CREATED_BY])

        assert.equal(scrubbed.api_key, '***')
        assert.doesNotMatch(scrubbed.error, new RegExp(KEY))
        assert.match(scrubbed.error, /\*\*\*/)
        assert.doesNotMatch(scrubbed.raw.errMsg, new RegExp(CREATED_BY))
        assert.doesNotMatch(scrubbed.raw.note, new RegExp(KEY))
    })

    it('leaves document identifiers untouched', () => {
        const scrubbed = scrubSecrets({
            docId: '6f1e7a4b-2f1c-4e6a-9d1b-1a2b3c4d5e6f',
            docUrl: 'https://example.test/a.pdf'
        }, [KEY])

        assert.equal(scrubbed.docId, '6f1e7a4b-2f1c-4e6a-9d1b-1a2b3c4d5e6f')
        assert.equal(scrubbed.docUrl, 'https://example.test/a.pdf')
    })
})

describe('createDoc', () => {
    it('sends created_by_api_key only when configured', async () => {
        const calls = stubFetch({ success: true, doc_number: 1, pdf_link: 'https://example.test/1.pdf' })
        const client = createClient()

        await client.createDoc({ config: { apiKey: KEY, developerEmail: 'dev@example.test', baseUrl: 'https://demo.example' }, payload: { type: 320 } })
        await client.createDoc({ config: { apiKey: KEY, createdByApiKey: CREATED_BY, developerEmail: 'dev@example.test', baseUrl: 'https://demo.example' }, payload: { type: 320 } })

        assert.equal(calls[0].body.created_by_api_key, undefined)
        assert.equal(calls[1].body.created_by_api_key, CREATED_BY)
        assert.equal(calls[1].body.api_key, KEY)
        assert.equal(calls[0].url, 'https://demo.example/api/createDoc')
    })

    it('never returns an echoed API key to the caller', async () => {
        stubFetch({
            errNum: 1,
            errMsg: `your API KEY \`${KEY}\` is not correct for the environment production`,
            success: false
        })
        const client = createClient()

        const result = await client.createDoc({
            config: { apiKey: KEY, developerEmail: 'dev@example.test', baseUrl: 'https://demo.example' },
            payload: { type: 320 }
        })

        assert.equal(result.ok, false)
        assert.doesNotMatch(JSON.stringify(result), new RegExp(KEY))
        assert.match(result.error, /\*\*\*/)
        assert.match(result.error, /not interchangeable/)
    })
})
