import boot from '../boot.js'
import importSupplyAreas from './importSupplyAreas.js'

const dryRun = process.argv.includes('--dry-run')
const skipOverlap = process.argv.includes('--skip-overlap')

const { DL } = await boot()
console.log(`[runSupplyAreaImport] Boot done — dryRun:${dryRun} skipOverlap:${skipOverlap}`)
await importSupplyAreas({ DL, dryRun, skipOverlap })
console.log('[runSupplyAreaImport] Done')
process.exit(0)
