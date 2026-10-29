export const PRODUCTS = 'products'

export async function setSyncState(DL, key, fields = {}) {
    await DL.ComaxSyncState.updateOne({ key }, { $set: fields }, { upsert: true })
}

/**
 * Close out a run.
 *
 * `advance` must only be true when the delta is fully written. A failed
 * batch or an unparseable item means those products are missing from the DB,
 * so the old watermark has to stay and the next run re-fetches the same
 * window (upserts are idempotent — the cost is one repeated window).
 *
 * `extra` is written as-is (e.g. the per-feed item counts used by the
 * snapshot import's collapse guard).
 */
export async function completeRun(DL, key, { startedAt, processed = 0, failed = 0, unparsed = 0, error = null, advance = false, status = null, ...extra }) {
    const fields = {
        ...extra,
        status: status || (error ? 'error' : (advance ? 'success' : 'partial')),
        processed,
        failed: failed + unparsed,
        startedAt,
        finishedAt: new Date()
    }
    if (error) fields.error = String(error?.message || error).slice(0, 500)
    if (advance) fields.lastSyncAt = startedAt

    await setSyncState(DL, key, fields)
    return fields
}
