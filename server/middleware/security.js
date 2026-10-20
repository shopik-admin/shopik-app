import helmet from 'helmet'
import cors from 'cors'
import { rateLimit } from 'express-rate-limit'
import { expandOrigins, normalizeHostname } from '#server/utils/normalizeDomain.js'

export const isProdEnv = () =>
    process.env.NODE_ENV === 'production' ||
    process.env.PRODUCTION === 'true' ||
    Boolean(process.env.PRODUCTION)

const REFRESH_MS = 3_600_000 // 1h — new/disabled domains are rare; restarts reload immediately
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 1000 // shared store/office IPs: tens of pickers per IP; still far below script abuse

async function loadAllowedOrigins(DL, warn) {
    try {
        const domains = await DL.Domain.read({ active: true }, { url: 1 }, { limit: 0 })
        const allowed = new Set()
        const prodOnly = isProdEnv()
        for (const d of domains || []) {
            if (!d?.url) continue
            try {
                for (const origin of expandOrigins(normalizeHostname(d.url))) {
                    // Prod serves HTTPS only: never allow credentialed http://
                    // origins in production (downgrade/MITM). Local dev keeps
                    // http:// (this loader only runs in prod anyway).
                    if (prodOnly && origin.startsWith('http://')) continue
                    allowed.add(origin)
                }
            } catch {
                // skip invalid stored urls (admin can fix via Domains page)
            }
        }
        return allowed
    } catch (e) {
        warn?.('CORS allowlist load failed (fail-closed, keeping previous):', e?.message || e)
        return null
    }
}

// Shared-budget rate-limit store backed by Redis (express-rate-limit v8
// Store interface). The default MemoryStore gives every replica its own
// budget (N× with N replicas). Fail-open: any Redis error counts 0 hits so
// a dead Redis degrades to unmetered instead of 500ing all /api traffic.
function redisStore(redis) {
    const keyOf = (key) => `rl:api:${key}`
    return {
        async increment(key) {
            const now = Date.now()
            const resetTime = new Date(now + RATE_WINDOW_MS)
            try {
                const totalHits = await redis.incr(keyOf(key))
                if (totalHits === 1)
                    await redis.expire(keyOf(key), Math.ceil(RATE_WINDOW_MS / 1000))
                let ttlMs = RATE_WINDOW_MS
                try {
                    const ttl = await redis.ttl(keyOf(key))
                    if (ttl > 0) ttlMs = ttl * 1000
                } catch { }
                return { totalHits, resetTime: new Date(now + ttlMs) }
            } catch {
                return { totalHits: 0, resetTime }
            }
        },
        async decrement(key) {
            try { await redis.decr(keyOf(key)) } catch { }
        },
        async resetKey(key) {
            try { await redis.del(keyOf(key)) } catch { }
        },
    }
}

export default async function setupSecurity(app, bootData) {
    const warn = bootData?.utils?.log?.warn?.bind(bootData.utils.log) || console.warn

    app.set('trust proxy', 1)

    // Lenient start: CSP + COEP disabled (SSR inlines <style> and window.__SD__).
    // Tighten with nonces in a follow-up.
    // DISABLE_FRAMEGUARD=true lifts X-Frame-Options / frame-ancestors (e.g. so the
    // Hyp payment iframe can frame the callback cross-origin in test envs).
    // NEVER honored in prod — fail-safe default is helmet ON everywhere.
    const disableFrameguard = process.env.DISABLE_FRAMEGUARD === 'true' && !isProdEnv()
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
        frameguard: disableFrameguard ? false : undefined
    }))

    if (!isProdEnv()) return { allowedOrigins: null }

    let allowed = (await loadAllowedOrigins(bootData.DL, warn)) || new Set()
    const refresher = setInterval(async () => {
        const next = await loadAllowedOrigins(bootData.DL, warn)
        if (next) allowed = next
    }, REFRESH_MS)
    refresher.unref?.()

    app.use('/api', cors({
        origin: (origin, cb) => {
            if (!origin) return cb(null, true)
            cb(null, allowed.has(origin))
        },
        credentials: true
    }))

    const redis = bootData?.DL?.redis
    // Bind the shared store whenever a client exists, even if still
    // connecting — commands fail-open (0 hits) until the connection is up,
    // then the budget is shared. Gating on status === 'ready' would pin us
    // to the per-replica memory store for the life of the process.
    if (!redis || redis.status !== 'ready')
        warn('Rate limit store: Redis not ready at boot — shared budget applies once connected, unmetered until then')
    app.use('/api', rateLimit({
        windowMs: RATE_WINDOW_MS,
        max: RATE_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        ...(redis ? { store: redisStore(redis) } : {}),
    }))

    return { get allowedOrigins() { return allowed } }
}
