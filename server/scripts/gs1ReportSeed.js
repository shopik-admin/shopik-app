/**
 * Offline GS1 text-enrichment seed.
 *
 * Builds `gs1_products` docs from a flat GS1 portal report export (xlsx → JSONL,
 * see the one-off extractor) WITHOUT calling the GS1 API. The report carries the
 * descriptive payload the messages-queue sync never delivered for these products;
 * it does NOT carry `media_assets`, so the seeded docs have assetCount 0 and the
 * images phase stays a no-op (text enrichment only).
 *
 * The `raw` we synthesise mirrors the shape mapGs1ToProduct (mapper.js) reads, so
 * the existing enrich phase is the only writer that touches Products. Existing
 * gs1_products docs are used as the source of truth for the kashrut name→code map
 * and the nutrition row catalog (the report only carries Hebrew display names).
 *
 * Idempotent-ish: skips GTINs already present (by barcode or productCode). A later
 * real fetch overwrites the synthetic raw (no fingerprint → freshness check won't skip).
 *
 * Usage: node server/scripts/runGs1ReportSeed.js --file <rows.jsonl> --headers <headers.json>
 *          [--dry-run] [--limit N]
 */
import fs from 'fs'
import readline from 'readline'
import { pruneEmpty } from '#server/external/gs1/prune.js'
import { aliasCandidates, aliasMinLen } from '#server/services/gs1/alias.js'
import log from '#server/utils/log.js'

const ACTIVE_STATUS = 'פעיל' // active

const RLM = /[\u200e\u200f\u202a-\u202e]/g
const DASHES = /[\u2010-\u2015\u2212]/g

const stripMarks = s => String(s ?? '').replace(RLM, '').replace(/\u00a0/g, ' ').trim()

// Leading-zero strip — GTIN ↔ stored barcode (Comax holds numbers without the
// zero). Never numeric: '0123456' and '123456' must stay distinguishable elsewhere.
const normDigits = s => {
    const t = String(s ?? '')
    return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, '') : t
}

// Report GTIN column is numeric (drops leading zeros); the product_code middle
// segment preserves the full GTIN. Prefer it.
function canonicalGtin(row) {
    if (row.pc) {
        const m = /^[^_]*_[^_]*_(\d+)_/.exec(row.pc)
        if (m) return m[1]
    }
    return row.gtin
}

// '‎2026–07–21 06:08:47' → '2026-07-21 06:08:47'
function normDateTime(v) {
    if (!v) return undefined
    const s = String(v).replace(RLM, '').replace(/\u00a0/g, ' ').replace(DASHES, '-').trim()
    return s || undefined
}

// --- nutrition label normalisation -----------------------------------------
const stripParens = s => String(s).replace(/\([^)]*\)/g, ' ')
const stripSuffix = s => String(s)
    .replace(/ל[\u2010-\u2015\u2212-]?\s*100\s*(גרם|מל מוכן|מל)?/g, ' ')
    .replace(/למנה/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const collapse = s => String(s).replace(RLM, '').replace(/\s+/g, ' ').trim()
const nutKey = s => collapse(stripSuffix(s)).replace(/\s+/g, '')

// Scrape columns carry short display names; the GS1 catalog stores the full label
// ('אנרגיה (קלוריות)'), which prefix/containment matching can't reach from
// 'קלוריות'. Map the ones that would otherwise be dropped.
const LABEL_SYNONYMS = { 'קלוריות': 'אנרגיה (קלוריות)' }

// Match one report nutrient header to a catalog entry. English headers join on
// field_name; Hebrew headers normalize (suffix/parens/RLM) with a prefix fallback.
function matchNutrient(header, catalog) {
    let h = stripMarks(header)
    if (LABEL_SYNONYMS[h]) h = LABEL_SYNONYMS[h]
    if (/^[A-Za-z0-9_]+$/.test(h)) {
        const e = catalog.byField.get(h.toLowerCase())
        return e ? { entry: e, serving: /per_serving|_serving/i.test(h) } : null
    }
    const k1 = nutKey(stripParens(h))
    const k2 = nutKey(h)
    const exact = catalog.byLabel.get(k1) || catalog.byLabelParen.get(k2)
    if (exact) return { entry: exact, serving: /למנה/.test(h) }
    let best = null
    for (const [k, e] of catalog.byLabel) {
        if (k.length < 3) continue
        const hit = k.startsWith(k1) || k1.includes(k) || k.includes(k1)
        if (hit && (!best || k.length < best.k.length)) best = { k, e }
    }
    return best ? { entry: best.e, serving: /למנה/.test(h) } : null
}

// Food_Symbol_Red report text → GS1 codes mapper.mapNutrients understands
// (FSR2 sodium, FSR3 sugar, FSR4 fat, FSR5 green symbol).
function foodSymbolRed(text) {
    if (!text) return undefined
    const t = String(text)
    if (/ללא/.test(t)) return undefined
    const codes = []
    if (/סוכר/.test(t)) codes.push('FSR3')
    if (/נתרן|מלח/.test(t)) codes.push('FSR2')
    if (/שומן/.test(t)) codes.push('FSR4')
    if (/סמל ירוק/.test(t)) codes.push('FSR5')
    return codes.length ? codes.map(code => ({ code })) : undefined
}

async function readJsonl(path, onRow) {
    const rl = readline.createInterface({ input: fs.createReadStream(path, { encoding: 'utf8' }) })
    for await (const line of rl) {
        if (!line.trim()) continue
        onRow(JSON.parse(line))
    }
}

async function allBarcodes(Model) {
    const set = new Set()
    for await (const d of Model.find({}, { _id: 0, barcode: 1 }).lean())
        if (d?.barcode != null) set.add(normDigits(d.barcode))
    return set
}

// Kashrut catalogs keep three views of the same data: display name → code,
// normalized name → code, and code → display name. Report cells carry RLM marks
// and non-breaking spaces, so the plain map alone misses strings that are the
// same name with different spacing — and a report cell can already BE a code.
const normName = s => collapse(s).toLowerCase()

const kashrutCatalog = () => ({ name: new Map(), norm: new Map(), codeName: new Map() })

// value→code maps + nutrition catalog, all derived from stored raws.
async function buildCatalogs(Model) {
    const rabbinate = kashrutCatalog()
    const supervision = kashrutCatalog()
    const passover = kashrutCatalog()
    const byLabel = new Map()
    const byLabelParen = new Map()
    const byField = new Map()

    const kashrutCur = Model.find({}, { _id: 0, 'raw.product_info.Kashrut': 1 }).lean()
    for await (const d of kashrutCur) {
        const k = d?.raw?.product_info?.Kashrut
        if (!k) continue
        const absorb = (map, arr) => {
            for (const e of (Array.isArray(arr) ? arr : [])) {
                const v = e?.value != null ? String(e.value).trim() : ''
                const c = e?.code != null ? String(e.code).trim() : ''
                if (!v || !c) continue
                if (!map.name.has(v)) map.name.set(v, c)
                const n = normName(v)
                if (n && !map.norm.has(n)) map.norm.set(n, c)
                if (!map.codeName.has(c)) map.codeName.set(c, v)
            }
        }
        absorb(rabbinate, k.Rabbinate)
        absorb(supervision, k.Kosher_Supervision_Type)
        absorb(passover, k.Kosher_for_Passover)
    }

    const nutCur = Model.find({}, { _id: 0, 'raw.product_info.Nutritional_Values.table.rows': 1 }).lean()
    for await (const d of nutCur) {
        const rows = d?.raw?.product_info?.Nutritional_Values?.table?.rows
        if (!Array.isArray(rows)) continue
        for (const r of rows) {
            const code = r?.code != null ? String(r.code) : ''
            const label = collapse(r?.label || '')
            const f100 = r?.fields?.[0]?.field_name || ''
            const fSrv = r?.fields?.[1]?.field_name || ''
            const uom = r?.fields?.[0]?.UOM || ''
            if (!code || !label) continue
            const entry = { code, label, field100: f100, fieldServing: fSrv, uom }
            const kNoParen = nutKey(stripParens(label))
            const kParen = nutKey(label)
            if (!byLabel.has(kNoParen)) byLabel.set(kNoParen, entry)
            if (!byLabelParen.has(kParen)) byLabelParen.set(kParen, entry)
            if (f100 && !byField.has(f100.toLowerCase())) byField.set(f100.toLowerCase(), entry)
            if (fSrv && !byField.has(fSrv.toLowerCase())) byField.set(fSrv.toLowerCase(), entry)
        }
    }
    return { rabbinate, supervision, passover, byLabel, byLabelParen, byField }
}

function buildNutrition(row, headers, catalog, stats) {
    if (!row.nut) return undefined
    const acc = new Map() // code -> { entry, per100, perServing }
    const cellOf = entry => {
        if (!acc.has(entry.code)) acc.set(entry.code, { entry, per100: undefined, perServing: undefined })
        return acc.get(entry.code)
    }
    // The report lays columns out as triples (per-100 / per-serving / percent) but
    // the two value columns don't always share the same label ('שומנים' vs
    // 'סך השומנים'), so per-serving reuses the nutrient of the preceding column.
    const items = Object.entries(row.nut)
        .map(([k, v]) => ({ i: Number(k), v }))
        .sort((a, b) => a.i - b.i)
    let last100 = null
    for (const { i, v } of items) {
        const header = headers?.[i]
        if (!header) continue
        const h = stripMarks(header)
        if (/אחוז/.test(h)) continue // percent column — main table has no such column
        if (/למנה/.test(h)) {
            const entry = last100?.entry || matchNutrient(h, catalog)?.entry
            if (entry) cellOf(entry).perServing = v
            else stats.nutUnmatched.add(h)
            continue
        }
        const m = matchNutrient(h, catalog)
        if (!m) { stats.nutUnmatched.add(h); last100 = null; continue }
        if (m.serving) { cellOf(m.entry).perServing = v; last100 = null }
        else { cellOf(m.entry).per100 = v; last100 = m }
    }
    if (!acc.size) return undefined
    const num = s => { const m = /-?\d+(\.\d+)?/.exec(String(s)); return m ? m[0] : undefined }
    const rows = []
    for (const { entry, per100, perServing } of acc.values()) {
        const fields = []
        if (per100 != null) fields.push({ col_label: 'ל-100 גרם', col_code: '78001', field_name: entry.field100 || undefined, name: `${entry.label} ל-100 גרם`, text: per100, value: num(per100), UOM: entry.uom || undefined })
        if (perServing != null) fields.push({ col_label: 'למנה', col_code: '78002', field_name: entry.fieldServing || undefined, name: `${entry.label} למנה`, text: perServing, value: num(perServing), UOM: entry.uom || undefined })
        if (fields.length) rows.push({ label: entry.label, code: entry.code, fields })
    }
    stats.nutMatched += rows.length
    return { table: { colLabels: [{ label: 'ל-100 גרם', code: '78001' }, { label: 'למנה', code: '78002' }], rows } }
}

function buildRaw(row, headers, ctx, stats) {
    const gtin = canonicalGtin(row)
    // Same rule as kashrut: a numeric-only brand is a portal/retailer ID, and the
    // mapper writes it straight to Product.label, so it would show as the brand.
    const brandIsId = /^\d+$/.test(String(row.brand ?? '').trim())
    if (brandIsId) stats.brandNumericSkipped++
    const main = {
        GTIN: gtin,
        Trade_Item_Description: row.trade,
        Short_Description: row.short,
        Net_Content: row.net,
        Supplier_Catalog_Number: row.catalog,
        GLN: row.gln,
        BrandName: brandIsId ? undefined : row.brand,
        Sub_Brand_Name: row.subbrand,
        Variant: row.variant,
        Country_of_Origin: row.origin ? [{ value: row.origin }] : undefined,
        Effective_Date_Time: normDateTime(row.effDate),
        GPC_Category_Code: row.gpc
    }
    const general = {
        Additional_Trade_Item_Description_1: row.addl1,
        Manufacturer_Name: row.mfrName,
        Manufacturer_Address: row.mfrAddr,
        Manufacturer_Product_Code: row.mfrCode,
        Target_Market: row.target,
        Search_Words: row.search,
        Discontinued_Date_Time: normDateTime(row.discont)
    }
    const marketing = {}
    if (Array.isArray(row.marketing)) {
        const keys = ['Trade_Item_Marketing_Message', 'Trade_Item_Marketing_Message_2', 'Trade_Item_Marketing_Message_3', 'Trade_Item_Marketing_Message_4', 'Trade_Item_Marketing_Message_5', 'Trade_Item_Marketing_Message_6', 'Trade_Item_Marketing_Message_7']
        row.marketing.forEach((v, i) => { if (v) marketing[keys[i]] = v })
    }
    // Report packs several supervision bodies into one cell, '|'-separated
    // (e.g. 'בדצ העדה החרדית|הרבנות הראשית לישראל'). The mapper expects one
    // entry per body so each resolves to its own stamp code: code catalog first
    // (the cell may already hold a code), then exact name, then normalized name,
    // then the bare string as the display fallback.
    const splitVals = (text, catalog) => {
        if (!text) return undefined
        return String(text).split('|').map(s => stripMarks(s)).filter(Boolean)
            .map(v => {
                const code = catalog?.codeName?.get(v) || catalog?.name?.get(v) || catalog?.norm?.get(normName(v))
                if (code) {
                    stats.kashrutByCode++
                    return { value: catalog.codeName.get(code) || v, code }
                }
                // A bare number is a retailer/portal ID, not a supervision body —
                // writing it as a display name would show '16' on the product page.
                if (/^\d+$/.test(v)) {
                    stats.kashrutNumericSkipped++
                    return null
                }
                stats.kashrutAsString++
                return { value: v }
            }).filter(Boolean)
    }
    const kashrut = {}
    if (row.rabbinate) kashrut.Rabbinate = splitVals(row.rabbinate, ctx.catalogs.rabbinate)
    if (row.board) kashrut.Board_of_Supervision = splitVals(row.board)
    if (row.supervision) kashrut.Kosher_Supervision_Type = splitVals(row.supervision, ctx.catalogs.supervision)
    if (row.passover) kashrut.Kosher_for_Passover = splitVals(row.passover, ctx.catalogs.passover)

    const components = {
        Ingredient_Sequence_and_Name: row.ingredients,
        Allergen_Type_Code_and_Containment: row.allergens,
        Allergen_Type_Code_and_Containment_May_Contain: row.allergensMay,
        Diet_Information: row.diet ? [{ value: row.diet }] : undefined
    }
    const additional = {
        Serving_Suggestion: row.serving,
        Consumer_Storage_Instructions: row.storage,
        Fat_Percentage_in_Product: row.fatPct,
        Cream_Percentage_in_Product: row.creamPct,
        Fruit_Percentage_in_Product: row.fruitPct,
        Alcohol_Percentage_in_Product: row.alcoholPct,
        Food_Symbol_Red: foodSymbolRed(row.foodRed)
    }
    const system = { modification_timestamp: normDateTime(row.mtime) }
    const internal = { product_code: row.pc || undefined, Name: row.productName || undefined }
    const dimensions = {
        height: row.dimHeight, depth: row.dimDepth, width: row.dimWidth
    }

    const info = pruneEmpty({
        Main_Fields: main,
        General_Information: general,
        Marketing_Information: marketing,
        Kashrut: kashrut,
        Product_Components_and_Instructions_General: components,
        Additional_Information: additional,
        System_Features: system,
        Internal_System_Fields: internal,
        Product_Dimensions: dimensions,
        Logistics_and_Commercial_Properties_Additional: { Product_Shelf_Life: row.shelfLife },
        Nutritional_Values: buildNutrition(row, headers, ctx.catalogs, stats)
    }) || {}

    const item = pruneEmpty({ product_info: info }) || {}
    return { gtin, item }
}

export default async function gs1ReportSeed(
    { DL } = {},
    { file, headersFile, dryRun = false, limit = 0 } = {}
) {
    if (!DL?.Gs1Product?.Model || !DL?.Product?.Model) throw new Error('DL required')
    if (!file) throw new Error('file (JSONL path) is required')
    if (!headersFile) throw new Error('headersFile (headers JSON path) is required')

    const headers = JSON.parse(fs.readFileSync(headersFile, 'utf8'))
    const Gs1 = DL.Gs1Product.Model
    const Product = DL.Product.Model

    log.warn('[gs1ReportSeed] loading catalogs from gs1_products...')
    const catalogs = await buildCatalogs(Gs1)

    log.warn('[gs1ReportSeed] loading products + existing gs1 barcodes...')
    const [productBarcodes, comaxBarcodes] = await Promise.all([
        allBarcodes(Product),
        allBarcodes(DL.ComaxProduct.Model)
    ])
    const relevant = new Set([...productBarcodes, ...comaxBarcodes])

    const gs1Barcodes = new Set()
    const gs1Codes = new Set()
    for await (const d of Gs1.find({}, { _id: 0, barcode: 1, productCode: 1 }).lean()) {
        if (d?.barcode != null) gs1Barcodes.add(normDigits(d.barcode))
        if (d?.productCode) gs1Codes.add(String(d.productCode))
    }

    // Short internal codes are covered when an existing GS1 doc aliases to them.
    // Without this, a report row for an already-covered product seeds a second doc
    // keyed by the short code, and enrich then rewrites the product from it.
    const coveredShorts = new Set()
    for (const g of gs1Barcodes)
        for (const c of aliasCandidates(g, aliasMinLen())) coveredShorts.add(c)

    // normalized barcode → actual stored Product barcode (what enrich exact-matches)
    const actualByNorm = new Map()
    for await (const d of Product.find({}, { _id: 0, barcode: 1 }).lean())
        if (d?.barcode != null && !actualByNorm.has(normDigits(d.barcode))) actualByNorm.set(normDigits(d.barcode), d.barcode)

    const stats = {
        rows: 0, active: 0, relevant: 0, already: 0, alreadyExact: 0, alreadyAlias: 0, seeded: 0,
        noProductCode: 0, keyFallback: 0, nutMatched: 0, nutUnmatched: new Set(),
        kashrutByCode: 0, kashrutAsString: 0, kashrutNumericSkipped: 0, brandNumericSkipped: 0
    }
    const docs = []

    await readJsonl(file, row => {
        stats.rows++
        if (row.status !== ACTIVE_STATUS) return
        stats.active++
        const cg = canonicalGtin(row)
        // product_code can reference a different item than the row. Prefer it (it
        // keeps the full GTIN), but when its GTIN is not in the catalog and the
        // row's own GTIN is, key the doc at the row — otherwise the row is gated
        // out and its product gets no GS1 content.
        let key = normDigits(cg)
        if (!relevant.has(key) && row.gtin && relevant.has(normDigits(row.gtin))) {
            key = normDigits(row.gtin)
            stats.keyFallback++
        }
        if (!relevant.has(key)) return
        stats.relevant++
        if (gs1Barcodes.has(key)) { stats.alreadyExact++; return }
        if (coveredShorts.has(key)) { stats.alreadyAlias++; return }
        if (row.pc && gs1Codes.has(String(row.pc))) { stats.already++; return }
        if (!row.pc) stats.noProductCode++
        if (limit && docs.length >= limit) return
        const { item } = buildRaw(row, headers, { catalogs }, stats)
        docs.push({
            barcode: actualByNorm.get(key) || key,
            productCode: row.pc || '',
            modificationTime: row.mtime ? new Date(normDateTime(row.mtime)) : undefined,
            status: 'fetched',
            raw: item,
            syncedAt: new Date()
        })
    })

    log.info(`[gs1ReportSeed] rows=${stats.rows} active=${stats.active} relevant=${stats.relevant} `
        + `already=${stats.alreadyExact + stats.alreadyAlias + stats.already} `
        + `(exact=${stats.alreadyExact} alias=${stats.alreadyAlias} productCode=${stats.already}) `
        + `toSeed=${docs.length} noProductCode=${stats.noProductCode} keyFallback=${stats.keyFallback}`)
    log.info(`[gs1ReportSeed] nutrition: matchedRows=${stats.nutMatched} unmatchedLabels=${stats.nutUnmatched.size}`)
    log.info(`[gs1ReportSeed] kashrut: resolvedToCode=${stats.kashrutByCode} storedAsNameOnly=${stats.kashrutAsString}`)
    if (stats.nutUnmatched.size)
        log.warn(`[gs1ReportSeed] unmatched nutrient labels: ${[...stats.nutUnmatched].slice(0, 30).join(' | ')}`)

    if (dryRun) {
        if (docs[0]) log.info(`[gs1ReportSeed] sample raw:\n${JSON.stringify(docs[0].raw).slice(0, 1200)}`)
        log.warn('[gs1ReportSeed] DRY RUN — no writes')
        return stats
    }

    for (let i = 0; i < docs.length; i += 500) {
        const chunk = docs.slice(i, i + 500)
        await DL.Gs1Product.bulkWrite({
            docs: chunk,
            getFilter: d => ({ barcode: d.barcode }),
            getUpsert: () => true,
            getUpdate: d => ({ $set: d })
        })
        stats.seeded += chunk.length
        log.info(`[gs1ReportSeed] seeded ${stats.seeded}/${docs.length}`)
    }
    log.success(`[gs1ReportSeed] done: ${stats.seeded} gs1_products docs seeded`)
    return stats
}
