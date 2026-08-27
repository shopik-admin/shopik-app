import boot from '../boot.js'
import importGovAddresses from './importGovAddresses.js'

const bootData = await boot()
console.log('[runGovImport] Boot done, starting import...')
await importGovAddresses(bootData)
console.log('[runGovImport] Done')
process.exit(0)
