import express, { json, urlencoded, static as serveStatic } from 'express'
import cookieParser from 'cookie-parser'
import path from 'path'
import router from './router.js'
import boot from './boot.js'
import ssr from './ssr.js'
import startImageWorker from '#server/workers/imageWorker.js'
import startGs1FetchWorker from '#server/workers/gs1FetchWorker.js'
import startGs1ProcessWorker from '#server/workers/gs1ProcessWorker.js'
import { resolveSizing } from '#server/services/gs1/sizing.js'
import startRefundRetry from '#server/cron/refundRetry.js'
import startNightlySync from '#server/cron/nightlySync.js'
import startGs1Sync from '#server/cron/gs1Sync.js'
import startHolidaySeed from '#server/cron/holidaySeed.js'
import log from '#server/utils/log.js'
import compression from 'compression'
import setupSecurity from './middleware/security.js'

console.log(`\n⚡ Starting server...\n`)

const
    bootData = await boot(),
    { PORT = 7777, PRODUCTION, NO_NIGHT_SYNC } = process.env,
    app = express()

await setupSecurity(app, bootData)

// Domain invariant: exactly one isDefault domain. Storefront requests without a
// resolvable Origin depend on it — zero means they 500, more than one is ambiguous.
try {
    const defaults = await bootData.DL.Domain.read({ isDefault: true }, { _id: 0, id: 1, name: 1 }, { limit: 0 })
    if (defaults.length === 0) {
        log.error('[Domain] No default domain configured (isDefault) — storefront requests without resolvable Origin will fail. Mark one via the Domains admin page.')
    } else if (defaults.length > 1) {
        log.error(`[Domain] Multiple default domains (${defaults.map(d => d.id).join(', ')}) — expected exactly one. First match wins until fixed via the Domains admin page.`)
    }
} catch (e) {
    log.warn('[Domain] Default-domain check skipped:', e?.message || e)
}

app.use((req, res, next) => {
    if (/\.php$/i.test(req.path)) return res.redirect(301, 'https://0.0.0.0')
    next()
})

app.use(json({ limit: '15mb' }))
app.use(cookieParser())
app.use(urlencoded({ extended: true, limit: '15mb' }))

app.use(compression())

router(app, bootData)

try {
    await startImageWorker({ DL: bootData.DL })
    const sizing = resolveSizing()
    await startGs1FetchWorker({ DL: bootData.DL, external: bootData.external, sizing })
    await startGs1ProcessWorker({ DL: bootData.DL, sizing })
    startRefundRetry(bootData)
    if (!NO_NIGHT_SYNC || PRODUCTION) {
        startNightlySync(bootData)
        startGs1Sync(bootData)
        startHolidaySeed(bootData)
    }
} catch (e) {
    log.warn('Jobs not started:', e?.message || e)
}

const staticHeaders = (res, filePath) => res.setHeader(
    'Cache-Control',
    filePath.includes(`${path.sep}assets${path.sep}`)
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=0, must-revalidate'
)

const serveClient = serveStatic('build/client', { index: false, setHeaders: staticHeaders })
const serveAdmin = serveStatic('build/admin', { index: false, setHeaders: staticHeaders })

app.use((req, res, next) => {
    const host = req.headers.host || ''
    if (host.startsWith('admin.')) {
        return serveAdmin(req, res, next)
    }
    return serveClient(req, res, next)
})

ssr(app, bootData)

app.listen(Number(PORT), '0.0.0.0', () => bootData.utils.log.colors((c) => `
${c.green}${c.bold}🚀 Server Running:${c.reset}
   ${PRODUCTION ? 'Production' : 'Development'} mode

     ${c.cyan}Client:${c.reset} ${c.gray}http://localhost:${PORT}${c.reset}
     ${c.cyan}Admin:${c.reset}  ${c.gray}http://admin.localhost:${PORT}${c.reset}\n`
))
