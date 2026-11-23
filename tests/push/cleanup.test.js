import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runPushCleanup } from '../../server/cron/pushCleanup.js'

const DAY_MS = 24 * 60 * 60 * 1000

function makeDL() {
    const calls = {}
    return {
        calls,
        DL: {
            PushSubscription: {
                Model: {
                    deleteMany: async filter => {
                        calls.subscriptions = filter
                        return { deletedCount: 2 }
                    }
                }
            },
            AdminNotification: {
                Model: {
                    deleteMany: async filter => {
                        calls.notifications = filter
                        return { deletedCount: 5 }
                    }
                }
            }
        }
    }
}

describe('runPushCleanup', () => {
    it('keeps only the last three days of the inbox', async () => {
        const { DL, calls } = makeDL()
        const now = new Date('2026-11-23T12:00:00Z')

        const result = await runPushCleanup({ DL, now })

        assert.deepEqual(calls.notifications, {
            createdAt: { $lt: new Date(now.getTime() - 3 * DAY_MS) }
        })
        assert.equal(result.notifications, 5)
    })

    it('still prunes stale subscriptions', async () => {
        const { DL, calls } = makeDL()
        const now = new Date('2026-11-23T12:00:00Z')

        const result = await runPushCleanup({ DL, now })

        assert.equal(result.subscriptions, 2)
        const staleBefore = new Date(now.getTime() - 30 * DAY_MS)
        assert.deepEqual(calls.subscriptions.$or[0], { disabledAt: { $ne: null, $lt: staleBefore } })
        assert.ok(Array.isArray(calls.subscriptions.$or))
    })
})
