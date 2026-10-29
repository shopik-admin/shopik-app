import boot from '../boot.js'
import ezcountCheck from './ezcountCheck.js'

// One-command EZcount check: config summary + a real 2-line document.
//
// Usage: node server/scripts/runEzcountCheck.js [--domain id] [--send-email]
//          [--credit] [--parent <docUuid>] [--transaction-id <id>]
//          [--api-key <key>] [--created-by-api-key <key>] [--no-created-by]
//          [--developer-email <email>] [--base-url <url>] [--note "text"]
//
// Defaults to whatever the env/Setting resolves to, creates the document without
// emailing anyone, and exits non-zero on failure. Credential flags override for
// this run only and are never persisted.
const args = process.argv.slice(2)
const has = name => args.some(a => a === `--${name}` || a.startsWith(`--${name}=`))
const flag = (name, def) => {
    const i = args.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`))
    if (i === -1) return def
    const eq = args[i].indexOf('=')
    if (eq !== -1) return args[i].slice(eq + 1)
    const next = args[i + 1]
    return next && !next.startsWith('--') ? next : true
}

const bootData = await boot()
console.log('[runEzcountCheck] Boot done, starting...\n')
const result = await ezcountCheck(bootData, {
    domainId: flag('domain', undefined),
    sendEmail: has('send-email'),
    note: typeof flag('note', undefined) === 'string' ? flag('note', undefined) : undefined,
    apiKey: typeof flag('api-key', undefined) === 'string' ? flag('api-key', undefined) : undefined,
    createdByApiKey: typeof flag('created-by-api-key', undefined) === 'string' ? flag('created-by-api-key', undefined) : undefined,
    developerEmail: typeof flag('developer-email', undefined) === 'string' ? flag('developer-email', undefined) : undefined,
    baseUrl: typeof flag('base-url', undefined) === 'string' ? flag('base-url', undefined) : undefined,
    noCreatedBy: has('no-created-by'),
    idTransaction: typeof flag('transaction-id', undefined) === 'string' ? flag('transaction-id', undefined) : undefined,
    credit: has('credit'),
    parent: typeof flag('parent', undefined) === 'string' ? flag('parent', undefined) : undefined
})
console.log(`\n[runEzcountCheck] ${result?.ok ? 'OK' : 'FAILED'}${result?.error ? `: ${result.error}` : ''}`)
process.exit(result?.ok ? 0 : 1)
