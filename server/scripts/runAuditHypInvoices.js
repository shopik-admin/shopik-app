import boot from '../boot.js'
import auditHypInvoices from './auditHypInvoices.js'

// Read-only: legacy Hyp documents on uncharged/canceled orders.
// Usage: node server/scripts/runAuditHypInvoices.js [--json]
const json = process.argv.slice(2).includes('--json')
const bootData = await boot()
console.log('[runAuditHypInvoices] Boot done, starting...')
const rows = await auditHypInvoices(bootData, { json })
if (json) console.log(JSON.stringify(rows, null, 2))
console.log('[runAuditHypInvoices] Done')
process.exit(0)
