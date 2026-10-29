import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { withTiebreaker } from '../../server/dl/defaults/read.js'

const fakeModel = (hasId = true) => ({
    schema: { path: name => (hasId && name === 'id' ? {} : null) }
})

describe('read sort tiebreaker', () => {
    it('appends the unique id when the sort key can tie', () => {
        assert.deepEqual(
            withTiebreaker(fakeModel(), { lastImportedAt: -1 }),
            { lastImportedAt: -1, id: 1 }
        )
    })

    it('falls back to _id for models without an id path', () => {
        assert.deepEqual(withTiebreaker(fakeModel(false), { updatedAt: -1 }), { updatedAt: -1, _id: 1 })
    })

    it('leaves an already unique sort alone', () => {
        assert.deepEqual(withTiebreaker(fakeModel(), { price: 1, id: 1 }), { price: 1, id: 1 })
    })

    it('leaves an unsorted full scan (limit: 0 sync/export) unsorted', () => {
        assert.equal(withTiebreaker(fakeModel(), undefined), undefined)
        assert.equal(withTiebreaker(fakeModel(), {}), undefined)
    })

    it('does not mutate the caller sort object', () => {
        const sort = { updatedAt: -1 }
        withTiebreaker(fakeModel(), sort)
        assert.deepEqual(sort, { updatedAt: -1 })
    })
})
