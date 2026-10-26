// Watermark + run status for the Comax catalog import (keyed docs).
// key 'products'     → { lastSyncAt } — the delta the next import starts from.
// key 'buyingPrices' → { lastSyncAt }
// The watermark advances ONLY after a fully successful run, so a run that
// died half way re-fetches the same delta next time instead of silently
// losing the products it never wrote.

const comaxSyncStateSchema = {
    key: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        filter: true
    },
    lastSyncAt: Date,
    status: String,
    processed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    startedAt: Date,
    finishedAt: Date,
    error: String,
    // Per-feed item counts of the last complete run, e.g.
    // { 'store:store-1': 9009, 'department:13': 1587 }.
    feeds: Object
}

export const meta = {}

export default comaxSyncStateSchema
