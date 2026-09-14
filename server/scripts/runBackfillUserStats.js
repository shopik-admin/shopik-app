import boot from '../boot.js'
import backfillUserStats from './backfillUserStats.js'

const bootData = await boot()
console.log('[runBackfillUserStats] Boot done, starting backfill...')
await backfillUserStats(bootData)
console.log('[runBackfillUserStats] Done')
process.exit(0)
