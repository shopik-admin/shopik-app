import { applyCategoryFlagStatuses, importCategoryFlags } from '#server/services/categoryMap/index.js'
import { invalidateMenu } from '#server/utils/data/getMenu.js'
import { scanDel } from '#server/utils/data/displayBlocks.js'

const MAX_BYTES = 5 * 1024 * 1024

function decodeCsv({ csvText, csvBase64 }) {
    if (typeof csvText === 'string' && csvText.trim()) return csvText
    if (typeof csvBase64 !== 'string' || !csvBase64.trim())
        throw { status: 400, message: 'csvBase64 required' }

    const payload = csvBase64.startsWith('data:')
        ? csvBase64.slice(csvBase64.indexOf(',') + 1)
        : csvBase64
    const buffer = Buffer.from(payload, 'base64')
    if (!buffer.length) throw { status: 400, message: 'invalid CSV file' }
    if (buffer.length > MAX_BYTES) throw { status: 400, message: 'CSV file is too large' }
    return buffer.toString('utf8')
}

/**
 * Upload the Comax category-filter file (the 10-column file with הצגת קטגוריה /
 * חובה כשרות). It only flips flags on existing category_map rows — the tree and
 * the sub-group assignments are left alone.
 *
 * The hide-only status sweep runs right after the import so the change is
 * visible immediately; un-hiding stays with the nightly Comax sync.
 */
export default async function importCategoryFlagFile(payload, { DL }) {
    const csvText = decodeCsv(payload)
    const flags = await importCategoryFlags({ DL, csvText })
    const status = await applyCategoryFlagStatuses({ DL })

    if (status.toWrite) {
        await invalidateMenu({ DL })
        if (DL.redis) await scanDel(DL.redis, 'display:*')
    }

    return {
        filename: payload.filename ? String(payload.filename).slice(0, 200) : null,
        codes: flags.codes,
        written: flags.written,
        unchanged: flags.unchanged,
        unknown: flags.unknown.length,
        skipped: flags.skipped.length,
        untouched: flags.untouched.length,
        hidden: status.toWrite,
        reasons: status.reasons
    }
}

importCategoryFlagFile.config = {
    permissions: ['category:update'],
    preventMultiple: true
}
