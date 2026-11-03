import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import updateOneFactory from '../../server/dl/defaults/updateOne.js'

// Fake model: findOneAndUpdate resolves to the given doc (what Mongo matched).
function fakeModel(doc, calls) {
    return {
        cacheStrategy: 'hashset',
        findOneAndUpdate: () => ({ lean: async () => doc }),
        cache: {
            add: d => calls.add.push(d?.id),
            del: id => calls.del.push(id)
        }
    }
}

describe('updateOne cache handling', () => {
    it('refreshes the cached doc when the update matched', async () => {
        const calls = { add: [], del: [] }
        const doc = { id: 'a1', value: 'x' }
        const res = await updateOneFactory(fakeModel(doc, calls))({ id: 'a1' }, { value: 'x' })
        assert.deepEqual(res, doc)
        assert.deepEqual(calls.add, ['a1'])
        assert.deepEqual(calls.del, [])
    })

    it('drops the stale cache entry when nothing matched in Mongo', async () => {
        const calls = { add: [], del: [] }
        const res = await updateOneFactory(fakeModel(null, calls))({ id: 'a1' }, { value: 'x' })
        assert.equal(res, null)
        assert.deepEqual(calls.add, [])
        assert.deepEqual(calls.del, ['a1'])
    })
})
