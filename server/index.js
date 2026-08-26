import express, { json, urlencoded, static as serveStatic } from 'express'
import cookieParser from 'cookie-parser'
import path from 'path'
import router from './router.js'
import boot from './boot.js'
import ssr from './ssr.js'
import startImageWorker from '#server/workers/imageWorker.js'
import startNightlySync from '#server/cron/nightlySync.js'
import startHolidaySeed from '#server/cron/holidaySeed.js'
import { getQueue, getConnection } from '#server/queues/imageQueue.js'
import log from '#server/utils/log.js'
import compression from 'compression'
import securityHeaders from '#server/utils/securityHeaders.js'

console.log(`\n⚡ Starting server...\n`)

const
    bootData = await boot(),
    { PORT = 7777, PRODUCTION } = process.env,
    app = express()

app.use((req, res, next) => {
    if (/\.php$/i.test(req.path)) {
        const clean = req.originalUrl.replace(/\.php([?#]|$)/i, '$1')
        return res.redirect(301, clean)
    }
    next()
})

app.use(securityHeaders)

app.use(json())
app.use(cookieParser())
app.use(urlencoded({ extended: true }))

app.use(compression())

router(app, bootData)

let imageWorker,
    nightlyTask,
    holidayTask
try {
    imageWorker = await startImageWorker({ DL: bootData.DL })
    nightlyTask = startNightlySync(bootData)
    holidayTask = startHolidaySeed(bootData)
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

const server = app.listen(Number(PORT), '0.0.0.0', () => bootData.utils.log.colors((c) => `
${c.green}${c.bold}🚀 Server Running:${c.reset}
   ${PRODUCTION ? 'Production' : 'Development'} mode

     ${c.cyan}Client:${c.reset} ${c.gray}http://localhost:${PORT}${c.reset}
     ${c.cyan}Admin:${c.reset}  ${c.gray}http://admin.localhost:${PORT}${c.reset}\n`
))

let shuttingDown = false
async function shutdown(signal) {
    if (shuttingDown) return
    shuttingDown = true
    log.warn(`${signal} received, shutting down gracefully...`)

    const forceExit = setTimeout(() => process.exit(1), 10000)
    forceExit.unref()

    try {
        server.close()
        await Promise.allSettled([
            nightlyTask?.stop?.(),
            holidayTask?.stop?.(),
            imageWorker?.close?.().catch(() => {}),
            getQueue().close().catch(() => {}),
            getConnection().quit().catch(() => {}),
            bootData.DL.disconnect?.()
        ])
    } catch (e) {
        log.error('Shutdown error:', e?.message || e)
    } finally {
        process.exit(0)
    }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
