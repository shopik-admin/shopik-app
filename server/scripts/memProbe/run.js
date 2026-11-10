/**
 * Cron memory probe.
 *
 * Runs the heavy cron phases against a local DB clone, sampling memory while
 * each phase runs (the peak is what sets the high-water mark, not the value
 * after it) and reporting what a forced GC can return.
 *
 *   node --env-file=.env --max-old-space-size=768 \
 *        server/scripts/memProbe/run.js --job=night --repeat=2
 *
 * --job: night (nightly → sales → gs1, the order the scheduler runs them),
 *        or one of nightly | sales | gs1 | gov | holiday.
 *
 * --repeat runs the whole job N times inside one process, which is the only
 * way to see the production symptom locally: a process that runs the same cron
 * every night and never gets its baseline back.
 *
 * Nothing here starts Express, the workers or the scheduler. --db/--redis
 * default to a scratch local DB and Redis db 9.
 */
import { fileURLToPath } from 'url'
import path from 'path'
import v8 from 'v8'
import vm from 'vm'
import { collectGarbage, mem } from '#server/utils/mem.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_DIR = path.resolve(__dirname, '../..')

const args = Object.fromEntries(
    process.argv.slice(2)
        .filter(a => a.startsWith('--'))
        .map(a => {
            const [k, ...rest] = a.replace(/^--/, '').split('=')
            return [k, rest.join('=')]
        })
)

const JOB = args.job || 'night'
const DB = args.db || 'mongodb://127.0.0.1:27017/store_memprobe'
const REDIS = args.redis || 'redis://127.0.0.1:6379/9'
const REPEAT = Math.max(1, Number(args.repeat || 1))
// runImages stages media zips in the real bucket, so keep the local run small.
const IMAGE_LIMIT = Number(args.imageLimit || process.env.GS1_IMAGE_LIMIT || 5)

// Must be set before connect.js reads them.
process.env.DB_URI = DB
process.env.REDIS_URL = REDIS
process.env.PRODUCTION = 'false'

const mb = bytes => Math.round(bytes / 1024 / 1024)

// A GC handle for the probe itself, without --expose-gc in the process flags:
// production runs the crons with collectGarbage() as a no-op, and the baseline
// has to measure that same behaviour, while still being able to ask "what could
// a full GC have reclaimed here?".
v8.setFlagsFromString('--expose-gc')
let probeGc = null
try {
    probeGc = vm.runInNewContext('gc')
} catch {
    probeGc = typeof global.gc === 'function' ? global.gc : null
}

function forceGc() {
    if (probeGc) {
        probeGc()
        return true
    }
    return collectGarbage()
}

function snap() {
    const m = process.memoryUsage()
    return {
        rss: mb(m.rss),
        heap: mb(m.heapUsed),
        heapTotal: mb(m.heapTotal),
        ext: mb(m.external),
        buffers: mb(m.arrayBuffers)
    }
}

// 20ms is enough to catch the peak of a multi-second phase without measuring
// the sampler instead of the job.
function startSampler(intervalMs = 20) {
    const peak = { rss: 0, heap: 0, heapTotal: 0, ext: 0, buffers: 0 }
    const sample = () => {
        const s = snap()
        for (const k of Object.keys(peak)) peak[k] = Math.max(peak[k], s[k])
    }
    sample()
    const id = setInterval(sample, intervalMs)
    id.unref?.()
    return () => {
        clearInterval(id)
        sample()
        return peak
    }
}

const report = []
const repeats = []

function row(tag, s) {
    return { rss: s.rss, heap: s.heap, heapTotal: s.heapTotal, ext: s.ext, buffers: s.buffers }
}

async function phase(name, fn) {
    const before = snap()
    const stop = startSampler()
    const started = Date.now()
    let error = null
    let result
    try {
        result = await fn()
    } catch (e) {
        error = e?.stack || e?.message || String(e)
    }
    const peak = stop()
    const after = snap()
    // What the app itself does at the end of a phase (no-op without
    // --expose-gc), then what a full collection could still reclaim.
    const appGc = collectGarbage()
    const afterGc = snap()
    const gcRan = forceGc()
    const afterFullGc = snap()

    const r = {
        phase: name,
        ms: Date.now() - started,
        before: row(name, before),
        peak: row(name, peak),
        after: row(name, after),
        afterGC: row(name, afterGc),
        afterFullGC: row(name, afterFullGc),
        appGc,
        gcRan,
        ...(error ? { error } : {})
    }
    report.push(r)
    console.log('PROBE ' + JSON.stringify(r))
    if (error) console.error(`[${name}] failed:`, error.split('\n')[0])
    return result
}

async function runJobs(iteration) {
    const tag = s => (iteration > 1 ? `${s}#${iteration}` : s)
    const queue = JOB === 'night' ? ['nightly', 'sales', 'gs1'] : [JOB]

    for (const job of queue) {
        if (job === 'nightly') {
            const { runNightlySync } = await import('#server/cron/nightlySync.js')
            await phase(tag('nightly'), () => runNightlySync({ DL, external }))
        }

        if (job === 'sales') {
            const { runSalesSync } = await import('#server/cron/salesSync.js')
            await phase(tag('sales'), () => runSalesSync({ DL, external }))
        }

        // The scheduler's GS1 job blocks on the fetch queue draining, and the
        // worker that drains it is not started here (see README in this folder),
        // so run its three phases explicitly instead.
        if (job === 'gs1') {
            const { runEnrich, runImages } = await import('#server/services/gs1/enrich.js')
            const { startRun, finalizeRun } = await import('#server/services/gs1/sync.js')
            const { initBulkFlusher, flush } = await import('#server/services/gs1/bulk.js')

            initBulkFlusher(DL)
            let run = null
            await phase(tag('gs1/enqueue'), async () => {
                run = await startRun({}, { DL, external })
                return run
            })
            await phase(tag('gs1/enrich'), () => runEnrich({
                DL, external, runId: run?.runId || `probe:${Date.now()}`, onlyInStock: true
            }))
            await phase(tag('gs1/flush'), () => flush())
            await phase(tag('gs1/images'), () => runImages({
                DL, external, runId: run?.runId || `probe:${Date.now()}`, limit: IMAGE_LIMIT
            }))
            await phase(tag('gs1/finalize'), async () => {
                await flush()
                if (run) await finalizeRun(run.runId, { DL }).catch(() => { })
            })
        }

        if (job === 'gov') {
            const { runGovAddressSync } = await import('#server/cron/nightlySync.js')
            await phase(tag('gov'), () => runGovAddressSync({ DL }))
        }

        if (job === 'holiday') {
            const { seedHolidays } = await import('#server/cron/holidaySeed.js')
            await phase(tag('holiday'), () => seedHolidays(DL))
        }
    }
}

const { default: createDL } = await import('#server/dl/index.js')
const { default: externalBuilder } = await import('#server/external/index.js')
const { CACHE_STRATEGIES } = await import('#common/constants.js')

const DL = await createDL(SERVER_DIR)
const external = externalBuilder({ DL })

// Isolate the image/bull queue state from any local dev data.
await DL.redis.flushdb().catch(() => { })

// HASHSET models answer reads from Redis only: an empty hashset returns [] and
// never falls back to Mongo, so a flushed cache makes every read look empty
// (the import then reports "no active cash registers"). Production runs with a
// warm cache, so rebuild it from the clone before measuring anything.
async function primeCache() {
    const started = Date.now()
    let models = 0
    let docs = 0
    for (const entry of Object.values(DL)) {
        const Model = entry?.Model
        if (Model?.cacheStrategy !== CACHE_STRATEGIES.HASHSET) continue
        const rows = await Model.find({}).lean()
        if (rows.length) await entry.cache.add(rows).catch(() => { })
        models++
        docs += rows.length
    }
    console.log(`cache primed: ${models} hashset models, ${docs} docs, ${Date.now() - started}ms`)
    collectGarbage()
}
await primeCache()

console.log(`\n=== cron memory probe: ${JOB} x${REPEAT} ===`)
console.log(`db=${DB}\nredis=${REDIS}\nheapLimit=${mb(v8.getHeapStatistics().heap_size_limit)}MB appGc=${typeof global.gc === 'function'} probeGc=${!!probeGc}\n`)
mem('boot', 'PROBE')

forceGc()
const boot = snap()
console.log('PROBE ' + JSON.stringify({ phase: 'boot', afterFullGC: row('boot', boot) }))

try {
    for (let i = 1; i <= REPEAT; i++) {
        const startedAt = Date.now()
        await runJobs(i)
        const appGc = collectGarbage()
        const afterJob = snap()
        const gcRan = forceGc()
        const end = snap()
        repeats.push({
            iteration: i,
            ms: Date.now() - startedAt,
            afterJob: row('afterJob', afterJob),
            afterFullGC: row('end', end),
            appGc,
            gcRan
        })
        console.log('PROBE_REPEAT ' + JSON.stringify(repeats[repeats.length - 1]))
    }
} finally {
    const m = process.memoryUsage()
    console.log('\nPROBE_SUMMARY ' + JSON.stringify({
        job: JOB,
        repeat: REPEAT,
        db: DB,
        heapLimitMb: mb(v8.getHeapStatistics().heap_size_limit),
        gcAvailable: typeof global.gc === 'function',
        boot: row('boot', boot),
        repeats: repeats.map(r => ({
            iteration: r.iteration,
            ms: r.ms,
            afterJob: r.afterJob,
            afterFullGC: r.afterFullGC,
            appGc: r.appGc,
            probeGc: r.gcRan
        })),
        phases: report.map(r => ({
            phase: r.phase,
            ms: r.ms,
            before: r.before,
            peak: r.peak,
            after: r.after,
            afterGC: r.afterGC,
            afterFullGC: r.afterFullGC,
            appGc: r.appGc,
            error: r.error ? r.error.split('\n')[0] : undefined
        })),
        final: row('final', {
            rss: mb(m.rss), heap: mb(m.heapUsed), heapTotal: mb(m.heapTotal),
            ext: mb(m.external), buffers: mb(m.arrayBuffers)
        })
    }))
    await DL.redis.quit().catch(() => { })
    const mongoose = (await import('mongoose')).default
    await mongoose.disconnect().catch(() => { })
    process.exit(0)
}
