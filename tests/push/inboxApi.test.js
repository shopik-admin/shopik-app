import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import remove from '../../server/api/notifications/delete.js'

function makeDL(result = { acknowledged: true, deletedCount: 1 }) {
    const calls = []
    return {
        calls,
        DL: {
            AdminNotification: {
                deleteOne: async filter => {
                    calls.push(filter)
                    return result
                }
            }
        }
    }
}

describe('notifications/delete', () => {
    it('always scopes the delete to the current admin', async () => {
        const { DL, calls } = makeDL()
        const result = await remove({ id: 'n-1' }, { DL, _admin: { id: 'admin-1' } })

        assert.deepEqual(calls, [{ id: 'n-1', adminId: 'admin-1' }])
        assert.deepEqual(result, { deleted: true })
    })

    it('rejects a missing id', async () => {
        const { DL, calls } = makeDL()
        await assert.rejects(
            () => remove({}, { DL, _admin: { id: 'admin-1' } }),
            error => error.status === 400
        )
        assert.equal(calls.length, 0)
    })

    it('reports when the row was not found', async () => {
        const { DL } = makeDL({ acknowledged: true, deletedCount: 0 })
        const result = await remove({ id: 'missing' }, { DL, _admin: { id: 'admin-1' } })
        assert.deepEqual(result, { deleted: false })
    })
})
