import boot from '../boot.js'
import seedEzcountSetting from './seedEzcountSetting.js'

// Seed/refresh the EZcount Setting for every domain (or --domain <id>).
// Usage: node server/scripts/runSeedEzcountSetting.js [--domain id]
//          [--enabled true] [--shadow true] [--api-key KEY]
//          [--developer-email EMAIL] [--base-url URL] [--crn-threshold 5000]
// Only supplied flags are written; the rest of the stored config is kept.
const args = process.argv.slice(2)
const flag = (name, def) => {
    const i = args.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`))
    if (i === -1) return def
    const eq = args[i].indexOf('=')
    if (eq !== -1) return args[i].slice(eq + 1)
    const next = args[i + 1]
    return next && !next.startsWith('--') ? next : true
}

const bootData = await boot()
console.log('[runSeedEzcountSetting] Boot done, starting...')
await seedEzcountSetting(bootData, {
    domainId: flag('domain', undefined),
    enabled: flag('enabled', undefined),
    shadowMode: flag('shadow', undefined),
    apiKey: flag('api-key', undefined),
    developerEmail: flag('developer-email', undefined),
    baseUrl: flag('base-url', undefined),
    crnThreshold: flag('crn-threshold', undefined)
})
console.log('[runSeedEzcountSetting] Done')
process.exit(0)
