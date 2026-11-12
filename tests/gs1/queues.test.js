import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { addBulkInChunks } from '../../server/queues/gs1Queues.js'

// gs1Queues only opens Redis lazily, so importing it never connects.
function recordingQueue(batches) {
    return { addBulk: async jobs => { batches.push(jobs.length) } }
}

describe('addBulkInChunks', () => {
    it('sends jobs in batches of GS1_ENQUEUE_CHUNK (default 500)', async () => {
        const batches = []
        await addBulkInChunks(recordingQueue(batches), Array.from({ length: 1200 }, (_, i) => ({ i })))
        assert.deepEqual(batches, [500, 500, 200])
    })

    it('does nothing for an empty list', async () => {
        const batches = []
        await addBulkInChunks(recordingQueue(batches), [])
        assert.deepEqual(batches, [])
    })

    it('honours GS1_ENQUEUE_CHUNK', async () => {
        process.env.GS1_ENQUEUE_CHUNK = '2'
        try {
            const batches = []
            await addBulkInChunks(recordingQueue(batches), [1, 2, 3])
            assert.deepEqual(batches, [2, 1])
        } finally {
            delete process.env.GS1_ENQUEUE_CHUNK
        }
    })
})
