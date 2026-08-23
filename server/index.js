import express, { json, urlencoded, static as serveStatic } from 'express'
import cookieParser from 'cookie-parser'
import router from './router.js'
import boot from './boot.js'
import ssr from './ssr.js'
import startImageWorker from '#server/workers/imageWorker.js'
import startNightlySync from '#server/cron/nightlySync.js'
import log from '#server/utils/log.js'

console.log(`\n⚡ Starting server...\n`)

const
    bootData = await boot(),
    { PORT = 7777, PRODUCTION } = process.env,
    app = express()

app.use(json())
app.use(cookieParser())
app.use(urlencoded({ extended: true }))

router(app, bootData)

try {
    await startImageWorker({ DL: bootData.DL })
    startNightlySync(bootData)
} catch (e) {
    log.warn('Jobs not started:', e?.message || e)
}

app.use('/', serveStatic('build/client', { index: false }))
app.use('/admin', serveStatic('build/admin', { index: false }))

ssr(app, bootData)

app.listen(Number(PORT), '0.0.0.0', () => bootData.utils.log.colors((c) => `
${c.green}${c.bold}🚀 Server Running:${c.reset}
   ${PRODUCTION ? 'Production' : 'Development'} mode

     ${c.cyan}Client:${c.reset} ${c.gray}http://localhost:${PORT}${c.reset}
     ${c.cyan}Admin:${c.reset}  ${c.gray}http://localhost:${PORT}/admin\n`
))
