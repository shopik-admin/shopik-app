/**
 * Hashset cache seed memory probe.
 *
 * Compares the old "load the whole collection + one giant HSET" seed with the
 * chunked seedCache path, in a fresh process per mode so the RSS high-water
 * mark from one run cannot flatter the next.
 *
 *   node --env-file=.env server/scripts/memProbe/cacheReset.js --mode=legacy
 *   node --env-file=.env server/scripts/memProbe/cacheReset.js --mode=chunked
 *
 * Reads DB_URI / REDIS_URL from the environment, writes only to the throwaway
 * `memprobe:gov_addresses` key and deletes it before exiting.
 */
import mongoose from 'mongoose'
import v8 from 'v8'
import vm from 'vm'
import connect from '#server/dl/connect.js'
import seedCache from '#server/dl/cache/seed.js'
import { CACHE_STRATEGIES } from '#common/constants.js'

const args = Object.fromEntries(
    process.argv.slice(2)
        .filter(a => a.startsWith('--'))
        .map(a => {
            const [k, ...rest] = a.replace(/^--/, '').split('=')
            return [k, rest.join('=')]
        })
)

const MODE = args.mode || 'legacy'
const COLLECTION = args.collection || 'gov_addresses'
const KEY = args.key || 'memprobe:gov_addresses'
const CHUNK = args.chunk ? Number(args.chunk) : undefined

// Same GC handle trick as run.js: no need to start node with --expose-gc.
v8.setFlagsFromString('--expose-gc')
let probeGc = null
try { probeGc = vm.runInNewContext('gc') } catch { probeGc = typeof global.gc === 'function' ? global.gc : null }
const forceGc = () => { if (probeGc) probeGc() }

const mb = bytes => Math.round(bytes / 1024 / 1024)
const START = performance.now()
const elapsed = () => ((performance.now() - START) / 1000).toFixed(2) + 's'
const peak = { rss: 0, heap: 0 }
function sample(tag) {
    const m = process.memoryUsage()
    peak.rss = Math.max(peak.rss, m.rss)
    peak.heap = Math.max(peak.heap, m.heapUsed)
    console.log(
        `${tag.padEnd(38)} t=${elapsed().padStart(7)} rss=${mb(m.rss)}MB heap=${mb(m.heapUsed)}/${mb(m.heapTotal)}MB ` +
        `ext=${mb(m.external)}MB buf=${mb(m.arrayBuffers)}MB`
    )
}

forceGc()
sample(`baseline (${MODE})`)

const { redis } = await connect()
if (!redis) {
    console.error('redis unavailable')
    process.exit(1)
}
await redis.del(KEY)

const schema = new mongoose.Schema({ id: String, city: String, street: String }, { versionKey: false })
const Model = mongoose.models.MemProbeGov || mongoose.model('MemProbeGov', schema, COLLECTION)
Model.cacheName = KEY
Model.cacheStrategy = CACHE_STRATEGIES.HASHSET
Model.filterFields = new Set()
Model.cache = await redis.init(Model)
const add = Model.cache.add
let seededDocs = 0
const seedStart = performance.now()

if (MODE === 'legacy') {
    const docs = await Model.find({}, { _id: 0 }).lean()
    sample(`after find (${docs.length} docs)`)

    Model.cache.add = async batch => {
        await add(batch)
        sample(`after HSET (${batch.length} docs)`)
    }
    await Model.cache.add(docs)
    seededDocs = docs.length
} else {
    Model.cache.add = async batch => {
        await add(batch)
        sample(`after HSET chunk (${batch.length} docs)`)
    }
    seededDocs = await seedCache(redis, Model, { size: CHUNK, clear: true })
    sample(`after chunked seed (${seededDocs} docs)`)
}
const seedSeconds = (performance.now() - seedStart) / 1000

sample('before cleanup')
const hlen = await redis.hlen(KEY)
forceGc()
sample('after GC (result released)')
console.log(`hash keys = ${hlen}`)

await redis.del(KEY)
await redis.quit()
await mongoose.disconnect()
forceGc()
sample('after key deleted + GC')
console.log(`peak rss = ${mb(peak.rss)}MB, peak heap = ${mb(peak.heap)}MB`)
console.log(`seed time = ${seedSeconds.toFixed(2)}s for ${seededDocs} docs (${Math.round(seededDocs / seedSeconds)} docs/s)`)
