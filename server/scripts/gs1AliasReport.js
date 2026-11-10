/**
 * Dry-run report for the GS1 short-barcode matcher.
 *
 * Pages `gs1_products` and resolves every GTIN against the Product catalog with
 * the same suffix rule enrich uses (server/services/gs1/alias.js). Writes a CSV
 * for review — no DB writes, no GS1 calls.
 *
 * The report is the safety net for relaxing the matcher: a unique suffix match
 * can still be the wrong product, so eyeball the alias/ambiguous rows before a
 * real enrich run. `sharedShortWith` flags reverse ambiguity (one short pointed
 * at by several GTINs).
 *
 * Usage: node server/scripts/runGs1AliasReport.js [--out <file.csv>]
 *          [--limit N] [--page N] [--only non-exact|all|alias|ambiguous|none]
 */
import fs from 'fs'
import log from '#server/utils/log.js'
import { aliasCandidates, aliasMinLen, aliasEnabled } from '#server/services/gs1/alias.js'

const DEFAULT_PAGE = 500

const csv = v => {
    const s = String(v ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default async function gs1AliasReport(
    { DL } = {},
    { out = '', limit = 0, page = DEFAULT_PAGE, only = 'non-exact' } = {}
) {
    if (!DL?.Gs1Product?.Model || !DL?.Product?.Model) throw new Error('DL required')
    const cap = Number(limit) || 0
    const pageSize = Math.max(1, Number(page) || DEFAULT_PAGE)
    const minLen = aliasMinLen()
    const wants = type => only === 'all' || (only === 'non-exact' ? type !== 'exact' : only === type)

    const productRows = await DL.Product.Model
        .find({}, { _id: 0, barcode: 1, name: 1, storeIds: 1 })
        .lean()
    const products = new Map()
    for (const p of productRows || [])
        if (p?.barcode != null) products.set(String(p.barcode), p)
    const productSet = new Set(products.keys())

    const rows = []
    const shortToGtins = new Map()
    const counts = {}
    let scanned = 0
    let lastId = null

    for (; ;) {
        const filter = lastId ? { _id: { $gt: lastId } } : {}
        const docs = await DL.Gs1Product.Model.find(filter, {
            _id: 1,
            barcode: 1,
            status: 1,
            aliasStatus: 1,
            aliasShort: 1,
            'raw.product_info.Main_Fields.Short_Description': 1,
            'raw.product_info.Main_Fields.BrandName': 1
        }).sort({ _id: 1 }).limit(pageSize).lean()
        if (!docs?.length) break
        lastId = docs[docs.length - 1]._id

        for (const d of docs) {
            if (cap && scanned >= cap) break
            const gtin = String(d?.barcode ?? '')
            if (!gtin) continue
            scanned++

            const main = d?.raw?.product_info?.Main_Fields || {}
            const gs1Name = [main.BrandName, main.Short_Description].filter(Boolean).join(' ')
            const status = d?.status || ''
            const push = (row) => {
                counts[row.matchType] = (counts[row.matchType] || 0) + 1
                if (wants(row.matchType)) rows.push(row)
            }

            // Explicit admin mapping wins over suffix guessing.
            if (d?.aliasStatus === 'manual' && d?.aliasShort) {
                if (productSet.has(d.aliasShort))
                    shortToGtins.set(d.aliasShort, (shortToGtins.get(d.aliasShort) || 0) + 1)
                push({ gtin, gs1Name, status, matchType: 'manual', short: d.aliasShort })
                continue
            }
            if (productSet.has(gtin)) {
                push({ gtin, gs1Name, status, matchType: 'exact' })
                continue
            }
            if (!aliasEnabled()) {
                push({ gtin, gs1Name, status, matchType: 'none' })
                continue
            }
            const hits = aliasCandidates(gtin, minLen).filter(c => productSet.has(c))
            if (!hits.length) {
                push({ gtin, gs1Name, status, matchType: 'none' })
            } else if (hits.length === 1) {
                shortToGtins.set(hits[0], (shortToGtins.get(hits[0]) || 0) + 1)
                push({ gtin, gs1Name, status, matchType: 'alias', short: hits[0] })
            } else {
                for (const short of hits)
                    shortToGtins.set(short, (shortToGtins.get(short) || 0) + 1)
                push({ gtin, gs1Name, status, matchType: 'ambiguous', short: hits.join('|'), options: hits })
            }
        }
        if (cap && scanned >= cap) break
    }

    const file = out || `gs1-alias-report-${new Date().toISOString().slice(0, 10)}.csv`
    const lines = [[
        'gtin', 'gs1Name', 'gs1Status', 'matchType', 'short',
        'productName', 'stores', 'candidates', 'sharedShortWith'
    ].join(',')]
    for (const r of rows) {
        const options = r.options || (r.short ? [r.short] : [])
        const product = options.length === 1 ? products.get(options[0]) : null
        lines.push([
            r.gtin,
            r.gs1Name,
            r.status,
            r.matchType,
            r.short || '',
            product?.name || '',
            product ? (product.storeIds || []).length : '',
            options.join('|'),
            options.length === 1 ? (shortToGtins.get(options[0]) || 1) - 1 : ''
        ].map(csv).join(','))
    }
    fs.writeFileSync(file, lines.join('\n'), 'utf8')

    log.info(`[gs1AliasReport] scanned=${scanned} ${JSON.stringify(counts)} → ${file}`)
    return { scanned, counts, rows: rows.length, file }
}
