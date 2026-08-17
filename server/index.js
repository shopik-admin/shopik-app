import express, { json, urlencoded, static as serveStatic } from 'express'
import cookieParser from 'cookie-parser'
import router from './router.js'
import boot from './boot.js'
import ssr from './ssr.js'

console.log(`\n⚡ Starting server database connections...\n`)

const
    bootData = await boot(),
    app = express(),
    { PORT = 7777 } = process.env

app.use(json())
app.use(cookieParser())
app.use(urlencoded({ extended: true }))

router(app, bootData)

app.use('/', serveStatic('build/client', { index: false }))
app.use('/admin', serveStatic('build/admin', { index: false }))

ssr(app, bootData)

app.listen(PORT, () => bootData.utils.log.colors((c) => `
${c.green}${c.bold}🚀 Server Running:${c.reset}
     ${c.cyan}Client:${c.reset} ${c.gray}http://localhost:${PORT}${c.reset}
     ${c.cyan}Admin:${c.reset}  ${c.gray}http://localhost:${PORT}/admin\n`
))
