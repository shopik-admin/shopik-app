/**
 * Backfill: restore `Product.producer` (the brand) from the stored GS1 raw.
 *
 * The Comax sync $sets every field it returns, and it returned
 * `producer: comax.manufacturer` — empty for most items. That wiped the
 * brand GS1 had written (BrandName || Manufacturer_Name) for ~14k products,
 * leaving only `label`, which GS1 fills with the *variant* (a flavour or a
 * sub-brand). The product card therefore showed "תות" where it should have
 * shown "תנובה".
 *
 * The Comax sync no longer writes an empty `producer`; this rewrites what
 * was already lost. Only an empty/missing `producer` is filled — a brand
 * that is already there is never replaced.
 *
 * Source of truth per product, in order:
 *   1. gs1_products by Product.gs1ProductCode (stored pointer from enrich),
 *   2. gs1_products by exact barcode (GTIN === product barcode).
 *
 * Usage: node server/scripts/runBackfillProductBrand.js [--dry-run]
 *          [--limit N] [--page N]
 */
import { aliasCandidates, aliasEnabled, aliasMinLen } from '#server/services/gs1/alias.js'

const DEFAULT_PAGE = 200

const clean = value => String(value ?? '').trim()

// The brand as mapGs1ToProduct computes it: BrandName first, then the
// manufacturer name. `label` (the variant) is deliberately not a brand.
function brandFromRaw(raw) {
    const info = raw?.product_info || {}
    const brand = clean(info?.Main_Fields?.BrandName)
    if (brand) return brand
    const manufacturer = clean(info?.General_Information?.Manufacturer_Name)
    if (manufacturer) return manufacturer
    return ''
}

export default async function backfillProductBrand(
    { DL } = {},
    { dryRun = false, limit = 0, page = DEFAULT_PAGE } = {}
) {
    if (!DL?.Product?.Model || !DL?.Gs1Product) throw new Error('DL required')
    const cap = Number(limit) || 0
    const pageSize = Math.max(1, Number(page) || DEFAULT_PAGE)
    const Product = DL.Product.Model

    const raws = await DL.Gs1Product.read(
        {}, { _id: 0, barcode: 1, productCode: 1 }, { limit: 0 }
    )
    const byProductCode = new Map()
    const byBarcode = new Map()
    for (const r of raws || []) {
        if (r?.productCode && !byProductCode.has(r.productCode)) byProductCode.set(r.productCode, r.barcode)
        if (r?.barcode) byBarcode.set(r.barcode, r.barcode)
    }
    const aliasToGtins = new Map()
    if (aliasEnabled()) {
        const minLen = aliasMinLen()
        for (const gtin of byBarcode.keys()) {
            for (const c of aliasCandidates(gtin, minLen)) {
                if (!aliasToGtins.has(c)) aliasToGtins.set(c, [])
                aliasToGtins.get(c).push(gtin)
            }
        }
    }
    const resolveGtin = product => {
        if (product?.gs1ProductCode && byProductCode.has(product.gs1ProductCode))
            return byProductCode.get(product.gs1ProductCode)
        if (product?.barcode && byBarcode.has(product.barcode))
            return product.barcode
        if (aliasEnabled() && product?.barcode) {
            const gtins = aliasToGtins.get(product.barcode) || []
            if (gtins.length === 1) return gtins[0]
        }
        return null
    }

    const totals = { scanned: 0, resolved: 0, orphan: 0, changed: 0, written: 0, identical: 0, skipped: 0 }

    console.log(`[backfillBrand] scanning products${dryRun ? ' (DRY RUN — no writes)' : ''}`)
    let lastId = null
    for (; ;) {
        const filter = lastId ? { _id: { $gt: lastId } } : {}
        const products = await Product.find(
            filter,
            { _id: 1, barcode: 1, producer: 1, gs1ProductCode: 1 }
        ).sort({ _id: 1 }).limit(pageSize).lean()
        if (!products?.length) break

        const wantGtins = new Set()
        for (const p of products) {
            if (cap && totals.scanned >= cap) break
            if (clean(p.producer)) { totals.skipped++; continue }
            const gtin = resolveGtin(p)
            if (gtin) wantGtins.add(gtin)
        }
        const rawDocs = wantGtins.size ? await DL.Gs1Product.read(
            { barcode: { $in: [...wantGtins] } },
            { _id: 0, barcode: 1, raw: 1 },
            { limit: 0 }
        ) : []
        const rawByGtin = new Map((rawDocs || []).map(d => [d?.barcode, d?.raw]))

        const updates = []
        for (const p of products) {
            if (cap && totals.scanned >= cap) break
            totals.scanned++
            if (clean(p.producer)) continue
            const gtin = resolveGtin(p)
            if (!gtin || !rawByGtin.has(gtin)) { totals.orphan++; continue }
            totals.resolved++
            const brand = brandFromRaw(rawByGtin.get(gtin))
            if (!brand) { totals.orphan++; continue }
            totals.changed++
            updates.push({ barcode: p.barcode, update: { $set: { producer: brand } } })
        }

        if (!dryRun && updates.length) {
            await DL.Product.bulkWrite({
                docs: updates,
                getFilter: d => ({ barcode: d.barcode }),
                getUpsert: () => false,
                getUpdate: d => d.update
            })
        }
        totals.written += updates.length

        lastId = products[products.length - 1]._id
        if (cap && totals.scanned >= cap) break
        if (totals.scanned % 2000 < pageSize)
            console.log(`[backfillBrand] ${totals.scanned} scanned, ${totals.changed} brand(s) restored...`)
    }

    console.log(
        `[backfillBrand] done: scanned=${totals.scanned} resolved=${totals.resolved} ` +
        `orphan=${totals.orphan} skipped=${totals.skipped}`
    )
    console.log(`[backfillBrand] changed=${totals.changed} written=${totals.written}`)
    return totals
}
