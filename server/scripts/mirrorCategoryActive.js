import { writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import boot from '../boot.js'
import { applyCategoryFlagStatuses, mirrorCategoryActive } from '../services/categoryMap/index.js'
import { invalidateMenu } from '../utils/data/getMenu.js'
import { scanDel } from '../utils/data/displayBlocks.js'

// Backfill category_map.categoryActive from the category tree. Needed once for
// rows created before the flag existed, and after a manual DB edit, because the
// admin checkbox only touches the branch it edits.
//
// Usage: node server/scripts/mirrorCategoryActive.js [--dry-run] [--no-status]
const args = process.argv.slice(2)
const has = name => args.includes(`--${name}`)
const dryRun = has('dry-run')
const withStatus = !has('no-status')

const bootData = await boot()
const { DL } = bootData

const mirror = await mirrorCategoryActive({ DL, dryRun })

console.log(`[categoryActive] rows to mirror: ${mirror.changed}${dryRun ? ' (DRY RUN — no writes)' : ''}`)
console.log(`[categoryActive] tightens: ${mirror.tightened.length}, relaxes: ${mirror.relaxed.length}`)

if (!dryRun) {
    if (!withStatus) {
        console.log('[categoryActive] status sweep skipped (--no-status)')
    } else {
        const status = await applyCategoryFlagStatuses({ DL, relaxCodes: mirror.relaxed })
        console.log(`[categoryActive] hidden: ${status.hidden}, unhidden: ${status.unhidden}`)

        if (status.updates.length) {
            const rb = path.join(os.tmpdir(), `category-active-status-rollback-${Date.now()}.json`)
            writeFileSync(rb, JSON.stringify(status.updates, null, 1))
            console.log(`[categoryActive] rollback written: ${rb}`)
        }

        if (status.toWrite) {
            await invalidateMenu({ DL })
            console.log('[categoryActive] menu cache invalidated')
            if (DL.redis) {
                const purged = await scanDel(DL.redis, 'display:*')
                console.log(`[categoryActive] display cache keys purged: ${purged}`)
            }
        }
    }
}

if (dryRun) console.log('[categoryActive] DRY RUN — no writes')
process.exit(0)
