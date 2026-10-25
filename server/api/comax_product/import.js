import mem, { collectGarbage } from '#server/utils/mem.js'
import { PRODUCTS, completeRun } from './watermark.js'
import { resolveFreshDepartments } from './freshDepartments.js'

const REGISTER_FILTER = { active: true, type: 'comax' }

function chunk(array, size) {
    if (!array.length) return []
    if (array.length <= size) return [array]
    const parts = []
    for (let i = 0; i < array.length; i += size) parts.push(array.slice(i, i + size))
    return parts
}

/**
 * Import what each store can actually sell, plus the counters Comax does not
 * stock-manage.
 *
 *   store feed       one Get_AllItemsDetailsBySearch per active cash register
 *                    with HasInventory=1 → the complete in-stock set of that
 *                    store (well under the 17,000-item cap, never truncated)
 *   department feed  one call per configured fresh department without
 *                    HasInventory (produce, butcher, fish, bakery, deli…)
 *
 * Both feeds are snapshots: `LastUpdatedFromDate` stays empty, so there is no
 * watermark to advance. `comax_sync_state` only records the run status and the
 * per-feed sizes used by the collapse guard.
 *
 * Absence from the response now means "out of stock", and that inference is
 * only safe when the response is complete — hence the guards: an empty,
 * truncated or collapsed feed never removes a storeIds entry.
 */
export default async function importComaxProducts(payload, { DL, external }) {
    const startedAt = new Date()

    // Batched writes over a streamed response: one item in memory at a time.
    const BATCH = Number(process.env.COMAX_IMPORT_BATCH || 1000)
    const STREAM_TIMEOUT_MS = Number(process.env.COMAX_STREAM_IDLE_TIMEOUT_MS || 600000)
    const GC_EVERY = Number(process.env.COMAX_IMPORT_GC_EVERY || 20)
    const PULL_CHUNK = Number(process.env.COMAX_STORE_PULL_CHUNK || 5000)

    // Get_AllItemsDetailsBySearch silently truncates at 17,000 items. A feed
    // sitting at the cap is missing products, so it may add but never remove.
    const ITEM_CAP = Number(process.env.COMAX_RESPONSE_ITEM_CAP || 17000)
    // A response far smaller than the previous run's is suspicious even when it
    // is not empty: Comax has answered from a half-built spool before.
    const MIN_PREVIOUS = Number(process.env.COMAX_FEED_MIN_PREVIOUS || 100)
    const COLLAPSE_RATIO = Number(process.env.COMAX_FEED_COLLAPSE_RATIO || 0.5)

    const previousState = await DL.ComaxSyncState
        .readOne({ key: PRODUCTS }, { _id: 0, feeds: 1 })
        .catch(() => null)
    const previousFeeds = previousState?.feeds || {}

    const registers = await DL.CashRegister.read(REGISTER_FILTER, { _id: 0, storeId: 1, data: 1 }, { limit: 0 })
    if (!registers?.length) {
        console.warn('[Comax Import] No active Comax cash registers — nothing to import')
        await completeRun(DL, PRODUCTS, { startedAt, status: 'skipped' })
        return { message: 'No active cash registers', count: 0 }
    }

    const storeIds = [...new Set(registers.map(r => r.storeId).filter(Boolean))]
    const feeds = {}
    const results = []
    const errors = []
    let written = 0
    let failedDocs = 0
    let unparsedDocs = 0
    let batchNo = 0

    const writeBatch = async (docs, addStoreIds) => {
        await DL.ComaxProduct.bulkWrite({
            docs,
            getFilter: p => ({ barcode: p.barcode }),
            // The store feed owns creation: only sellable, non-archived items.
            getUpsert: p => p.price > 0 && !p.archived,
            getUpdate: p => {
                // storeIds is owned by $addToSet, never by $set — a feed only
                // asserts "in stock here", it never replaces other stores.
                const { storeIds: _storeIds, ...fields } = p
                const $addToSet = addStoreIds.length
                    ? { storeIds: addStoreIds.length === 1 ? addStoreIds[0] : { $each: addStoreIds } }
                    : null
                return $addToSet ? { $set: fields, $addToSet } : { $set: fields }
            }
        })
    }

    /**
     * Stream one feed into comax_products and report how trustworthy its
     * "absent = out of stock" reading is.
     */
    const runFeed = async ({ key, label, addStoreIds, stream }) => {
        const stats = { blocks: 0, kept: 0, unparsed: 0 }
        const barcodes = new Set()
        let batch = []
        let count = 0
        let failed = 0
        let errored = null

        const flush = async () => {
            if (!batch.length) return
            const docs = batch
            batch = []
            batchNo++
            try {
                await writeBatch(docs, addStoreIds)
            } catch (e) {
                failed += docs.length
                console.error(`[Comax Import] ${label} batch ${batchNo} failed:`, e?.message || e)
            }
            count += docs.length
            mem(`${label}: ${count} products`, 'ComaxImport')
            if (GC_EVERY > 0 && batchNo % GC_EVERY === 0) collectGarbage()
        }

        try {
            for await (const p of stream(stats)) {
                p.lastImportedAt = startedAt
                if (p.barcode != null) barcodes.add(String(p.barcode))
                batch.push(p)
                if (batch.length >= BATCH) await flush()
            }
            await flush()
        } catch (e) {
            await flush()
            errored = e?.message || String(e)
            errors.push({ key, message: errored })
            console.error(`[Comax Import] ${label} failed:`, errored)
        }

        const blocks = stats.blocks
        const empty = !errored && blocks === 0
        const truncated = blocks >= ITEM_CAP
        const previous = Number(previousFeeds[key] ?? 0)
        const collapsed = !errored && previous >= MIN_PREVIOUS && blocks < previous * COLLAPSE_RATIO

        if (empty) console.warn(`[Comax Import] ${label} returned no items — keeping the stored stock state`)
        if (truncated) console.error(`[Comax Import] ${label} hit the ${ITEM_CAP}-item cap (${blocks}) — additions only`)
        if (collapsed) console.warn(`[Comax Import] ${label} returned ${blocks} items, down from ${previous} — additions only`)

        const removalsSafe = !errored && !empty && !truncated && !collapsed &&
            failed === 0 && stats.unparsed === 0

        // Only remember a feed size that came from a complete response:
        // a truncated or errored one must not poison the next comparison.
        if (!errored && !truncated && stats.unparsed === 0) feeds[key] = blocks

        written += count
        failedDocs += failed
        unparsedDocs += stats.unparsed

        results.push({ key, label, barcodes, removalsSafe, blocks, count, failed })
    }

    console.log(`[Comax Import] Store feed: ${registers.length} register(s), ${storeIds.length} store(s)`)
    mem('start', 'ComaxImport')

    // 1. Per-store in-stock feed.
    let firstComaxStoreId = ''
    for (const reg of registers) {
        const comaxStoreId = String(reg.data?.StockStoreID ?? '').trim()
        if (!comaxStoreId) {
            const message = 'missing StockStoreID — set cash_register.data.StockStoreID'
            console.error(`[Comax Import] store ${reg.storeId}: ${message}`)
            errors.push({ key: `store:${reg.storeId}`, message })
            continue
        }
        firstComaxStoreId ||= comaxStoreId

        // Optional count cross-check against the balance endpoint. Off by
        // default: it is a second multi-MB call per store and its result is
        // scoped by ChangesAfter, so a gap is informational at best.
        if (process.env.COMAX_BALANCE_CROSSCHECK === 'true' && typeof external.comax.getBalance === 'function') {
            try {
                const balances = await external.comax.getBalance({ storeId: comaxStoreId })
                const inStock = balances.filter(b => !b.error && b.balance > 0).length
                console.log(`[Comax Import] store ${reg.storeId}: items feed vs balance = ${inStock}`)
            } catch (e) {
                console.warn(`[Comax Import] store ${reg.storeId}: balance cross-check failed:`, e?.message || e)
            }
        }

        await runFeed({
            key: `store:${reg.storeId}`,
            label: `store ${reg.storeId} (Comax ${comaxStoreId})`,
            addStoreIds: [reg.storeId],
            stream: stats => external.comax.streamStoreProducts({
                storeId: comaxStoreId,
                timeoutMs: STREAM_TIMEOUT_MS,
                stats
            })
        })
    }

    // 2. Fresh (not stock-managed) departments. The response is
    // store-independent, so these items are in stock in every active store.
    const freshDepartments = await resolveFreshDepartments(DL)
    console.log(`[Comax Import] Fresh departments: ${freshDepartments.join(', ')}`)

    for (const departmentId of freshDepartments) {
        await runFeed({
            key: `department:${departmentId}`,
            label: `department ${departmentId}`,
            addStoreIds: storeIds,
            stream: stats => external.comax.streamDepartmentProducts({
                departmentId,
                storeId: firstComaxStoreId || undefined,
                timeoutMs: STREAM_TIMEOUT_MS,
                stats
            })
        })
    }

    // 3. Removals. Only a run in which every feed was complete may conclude
    // that a barcode is out of stock: a single empty/failed fresh department
    // would otherwise hide its whole counter.
    let removed = 0
    const incomplete = results.filter(r => !r.removalsSafe)
    if (incomplete.length) {
        console.warn(`[Comax Import] Skipping storeIds removals — incomplete feed(s): ${incomplete.map(r => r.label).join(', ')}`)
    } else {
        const freshBarcodes = new Set()
        for (const r of results) {
            if (!r.key.startsWith('department:')) continue
            for (const barcode of r.barcodes) freshBarcodes.add(barcode)
        }

        for (const reg of registers) {
            const feed = results.find(r => r.key === `store:${reg.storeId}`)
            if (!feed) continue

            const keep = new Set(feed.barcodes)
            for (const barcode of freshBarcodes) keep.add(barcode)

            const current = await DL.ComaxProduct.Model.distinct('barcode', { storeIds: reg.storeId })
            const stale = (current || []).filter(barcode => !keep.has(barcode))
            if (!stale.length) continue

            for (const part of chunk(stale, PULL_CHUNK)) {
                const res = await DL.ComaxProduct.Model.updateMany(
                    { barcode: { $in: part }, storeIds: reg.storeId },
                    { $pull: { storeIds: reg.storeId } }
                )
                removed += res?.modifiedCount || 0
            }
            console.log(`[Comax Import] store ${reg.storeId}: ${stale.length} item(s) no longer in stock`)
        }
    }

    const anyIncomplete = incomplete.length > 0 || errors.length > 0
    const status = written === 0 && anyIncomplete ? 'error' : anyIncomplete || failedDocs > 0 ? 'partial' : 'success'

    await completeRun(DL, PRODUCTS, {
        startedAt,
        processed: written - failedDocs,
        failed: failedDocs,
        unparsed: unparsedDocs,
        status,
        error: errors[0]?.message,
        feeds
    })

    const summary = `[Comax Import] ${written} item(s) from ${results.length} feed(s), ` +
        `${removed} storeIds removal(s), status ${status}`

    if (anyIncomplete) {
        console.warn(summary)
        return { message: 'Import partially failed', count: written, removed, status, errors }
    }

    console.log(summary)
    return { message: 'Import complete', count: written, removed, status }
}

importComaxProducts.config = {
    permissions: ['comax_product:update']
}
