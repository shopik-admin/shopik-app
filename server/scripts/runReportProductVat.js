import boot from '../boot.js'
import reportProductVat from './reportProductVat.js'

// Read-only: exempt (vat=false) products grouped by category + missing field.
// Usage: node server/scripts/runReportProductVat.js [--json]
const json = process.argv.slice(2).includes('--json')
const bootData = await boot()
console.log('[runReportProductVat] Boot done, starting...')
const report = await reportProductVat(bootData, { json })
if (json) console.log(JSON.stringify(report, null, 2))
console.log('[runReportProductVat] Done')
process.exit(0)
