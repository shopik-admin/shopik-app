/**
 * Clone the configured MongoDB database into a local one, so the cron jobs can
 * be replayed against a real dataset without writing to the shared cluster.
 *
 *   node --env-file=.env server/scripts/memProbe/clone.js \
 *        --to=mongodb://127.0.0.1:27017/store_memprobe
 *
 * Read-only on the source. Drops the target collections, then copies docs and
 * indexes (indexes matter: without them the reads scan instead of seek, which
 * would make the memory numbers meaningless).
 */
import mongoose from 'mongoose'

const { MongoClient } = mongoose.mongo

const args = Object.fromEntries(
    process.argv.slice(2)
        .filter(a => a.startsWith('--'))
        .map(a => {
            const [k, ...rest] = a.replace(/^--/, '').split('=')
            return [k, rest.join('=')]
        })
)

const FROM = args.from || process.env.DB_URI || process.env.DB
const TO = args.to || 'mongodb://127.0.0.1:27017/store_memprobe'
const ONLY = args.collections ? new Set(args.collections.split(',')) : null
const BATCH = Number(args.batch || 500)

if (!FROM) {
    console.error('no source uri (set DB in .env or pass --from=)')
    process.exit(1)
}

const src = new MongoClient(FROM, { serverSelectionTimeoutMS: 30000 })
const dst = new MongoClient(TO, { serverSelectionTimeoutMS: 30000 })

await src.connect()
await dst.connect()

const sdb = src.db()
const ddb = dst.db()

console.log(`clone ${sdb.databaseName} -> ${ddb.databaseName} (${FROM.split('@').pop()})`)

const collections = (await sdb.listCollections().toArray())
    .map(c => c.name)
    .filter(n => !ONLY || ONLY.has(n))
    .filter(n => !n.startsWith('system.'))

let totalDocs = 0
const started = Date.now()

for (const name of collections) {
    const s = sdb.collection(name)
    const d = ddb.collection(name)

    const count = await s.estimatedDocumentCount()
    await d.drop().catch(() => { })

    let copied = 0
    let buf = []
    const cursor = s.find({}, { batchSize: BATCH })
    for await (const doc of cursor) {
        buf.push(doc)
        if (buf.length >= BATCH) {
            await d.insertMany(buf, { ordered: false })
            copied += buf.length
            buf = []
        }
    }
    if (buf.length) {
        await d.insertMany(buf, { ordered: false })
        copied += buf.length
    }

    // Indexes after the data: faster inserts, and the reads afterwards get the
    // same plans they get in production.
    try {
        const indexes = await s.indexes()
        const defs = indexes
            .filter(i => i.name !== '_id_')
            .map(({ key, name: indexName, unique, sparse, expireAfterSeconds, partialFilterExpression }) => ({
                key,
                name: indexName,
                ...(unique ? { unique } : {}),
                ...(sparse ? { sparse } : {}),
                ...(expireAfterSeconds ? { expireAfterSeconds } : {}),
                ...(partialFilterExpression ? { partialFilterExpression } : {})
            }))
        if (defs.length) await d.createIndexes(defs).catch(e => console.warn(`  ${name}: index warn ${e.message}`))
    } catch (e) {
        console.warn(`  ${name}: index read warn ${e.message}`)
    }

    totalDocs += copied
    console.log(`  ${name.padEnd(30)} ${String(copied).padStart(8)}/${String(count).padStart(8)}`)
}

console.log(`done: ${collections.length} collections, ${totalDocs} docs, ${Math.round((Date.now() - started) / 1000)}s`)

await src.close()
await dst.close()
