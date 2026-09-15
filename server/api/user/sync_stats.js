import { statsDocFromRow, userStatsAggregation } from '#server/utils/data/userStats.js'

const CHUNK_SIZE = 1000
const CONCURRENCY = 5

function chunk(array, size) {
    const out = []
    for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size))
    return out
}

// Full rebuild of user_stats from orders: single aggregation pass,
// then chunked unordered bulk upserts run with bounded parallelism.
// Merge-upsert is idempotent — safe to retry, and live checkout writers
// keep working alongside it.
export default async function sync_stats(payload, { DL }) {
    const started = Date.now()
    const rows = await DL.Order.Model.aggregate(userStatsAggregation(), { allowDiskUse: true })
    const docs = (rows || []).map(statsDocFromRow)

    let upserted = 0
    let modified = 0
    const errors = []
    const chunks = chunk(docs, CHUNK_SIZE)

    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const batch = chunks.slice(i, i + CONCURRENCY)
        const results = await Promise.allSettled(batch.map(c =>
            DL.UserStat.bulkWrite({
                docs: c,
                getFilter: doc => ({ userId: doc.userId }),
                getUpsert: () => true,
                getUpdate: doc => ({ $set: doc })
            })
        ))
        for (const [j, res] of results.entries()) {
            if (res.status === 'fulfilled') {
                upserted += Number(res.value?.upsertedCount || 0)
                modified += Number(res.value?.modifiedCount || 0)
            } else {
                errors.push(`chunk ${i + j}: ${res.reason?.message || res.reason}`)
            }
        }
    }

    return { users: docs.length, upserted, modified, errors, ms: Date.now() - started }
}

sync_stats.config = {
    permissions: 'admin:super',
    preventMultiple: true
}
