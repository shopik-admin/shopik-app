import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import readFactory from '../../server/dl/cache/read.js'
import { CACHE_STRATEGIES } from '../../common/constants.js'

function fakeRedis(docs, pageSize = 10, status = 'ready') {
    const pages = []
    for (let i = 0; i < docs.length; i += pageSize) {
        const page = []
        for (const doc of docs.slice(i, i + pageSize)) page.push(doc.id, JSON.stringify(doc))
        pages.push(page)
    }

    const redis = {
        status,
        calls: 0,
        async hscan() {
            redis.calls++
            const page = pages.shift() || []
            return [pages.length ? String(redis.calls) : '0', page]
        }
    }
    return redis
}

const Model = {
    cacheStrategy: CACHE_STRATEGIES.HASHSET,
    cacheName: 'things',
    filterFields: new Set(['city']),
    processFilter: filter => filter
}

const docsOf = n => Array.from({ length: n }, (_, i) => ({
    id: String(i),
    city: i % 2 ? 'tlv' : 'jer',
    n: n - i
}))

describe('hashset cache read', () => {
    it('pages through the hash with HSCAN instead of HVALS', async () => {
        const redis = fakeRedis(docsOf(25))
        const read = readFactory(redis, Model)

        const rows = await read({}, { _id: 0 })

        assert.equal(rows.length, 25)
        assert.equal(redis.calls, 3)
    })

    it('stops scanning once an unsorted page is full', async () => {
        const redis = fakeRedis(docsOf(100))
        const read = readFactory(redis, Model)

        const rows = await read({}, { _id: 0 }, { limit: 5 })

        assert.equal(rows.length, 5)
        assert.equal(redis.calls, 1)
    })

    it('honours skip without over-reading', async () => {
        const redis = fakeRedis(docsOf(100))
        const read = readFactory(redis, Model)

        const rows = await read({}, { _id: 0 }, { skip: 2, limit: 3 })

        assert.deepEqual(rows.map(r => r.id), ['2', '3', '4'])
        assert.equal(redis.calls, 1)
    })

    it('filters while scanning and returns all matches for limit: 0', async () => {
        const redis = fakeRedis(docsOf(40))
        const read = readFactory(redis, Model)

        const rows = await read({ city: 'tlv' }, { _id: 0 }, { limit: 0 })

        assert.equal(rows.length, 20)
        assert.ok(rows.every(r => r.city === 'tlv'))
    })

    it('sorts every match before slicing', async () => {
        const redis = fakeRedis(docsOf(30))
        const read = readFactory(redis, Model)

        const rows = await read({}, { _id: 0 }, { sort: { n: 1 }, limit: 3 })

        assert.deepEqual(rows.map(r => r.n), [1, 2, 3])
        assert.equal(redis.calls, 3)
    })

    it('returns null when redis is unavailable so the caller falls back to mongo', async () => {
        const redis = fakeRedis(docsOf(5), 10, 'connecting')
        const read = readFactory(redis, Model)

        assert.equal(await read({}), null)
        assert.equal(redis.calls, 0)
    })
})
