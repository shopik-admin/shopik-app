import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import seedCache from '../../server/dl/cache/seed.js'
import { CACHE_STRATEGIES } from '../../common/constants.js'

function fakeModel(docs) {
    const batches = []
    const Model = {
        modelName: 'Thing',
        cacheStrategy: CACHE_STRATEGIES.HASHSET,
        cacheName: 'things',
        cache: { add: async batch => { batches.push(batch) } },
        find: () => ({
            lean: () => ({
                cursor: () => (async function* () {
                    for (const doc of docs) yield doc
                })()
            })
        })
    }
    return { Model, batches }
}

const docsOf = n => Array.from({ length: n }, (_, i) => ({ id: String(i) }))

describe('seedCache', () => {
    it('streams the cursor and writes one chunk at a time', async () => {
        const { Model, batches } = fakeModel(docsOf(25))

        const total = await seedCache(null, Model, { size: 10 })

        assert.equal(total, 25)
        assert.deepEqual(batches.map(b => b.length), [10, 10, 5])
        assert.equal(batches[0][0].id, '0')
        assert.equal(batches[2][4].id, '24')
    })

    it('uses the requested chunk size by default when all docs fit', async () => {
        const { Model, batches } = fakeModel(docsOf(3))

        assert.equal(await seedCache(null, Model, { size: 1000 }), 3)
        assert.equal(batches.length, 1)
    })

    it('clears the hash before seeding when asked', async () => {
        const { Model, batches } = fakeModel(docsOf(2))
        const deleted = []
        const redis = { del: async key => { deleted.push(key) } }

        const total = await seedCache(redis, Model, { clear: true, size: 10 })

        assert.deepEqual(deleted, ['things'])
        assert.equal(total, 2)
        assert.equal(batches.length, 1)
    })

    it('is a no-op for models without a hashset cache', async () => {
        const { Model, batches } = fakeModel(docsOf(2))
        Model.cacheStrategy = CACHE_STRATEGIES.VERSION

        assert.equal(await seedCache(null, Model), 0)
        assert.equal(batches.length, 0)
    })

    it('is a no-op when cache.add is missing', async () => {
        const { Model } = fakeModel(docsOf(2))
        delete Model.cache

        assert.equal(await seedCache(null, Model), 0)
    })
})
