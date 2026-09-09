// Watermark + run progress for the GS1 sync (keyed docs, no domain scoping).
// key 'watermark' → { lastSyncAt } — incremental runs start from here (minus overlap).
// key `run:<id>` → { status, total, processed, failed, startedAt, finishedAt } — bootstrap progress.

const gs1SyncStateSchema = {
    key: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        filter: true
    },
    lastSyncAt: Date,
    status: String,
    total: Number,
    processed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    startedAt: Date,
    finishedAt: Date,
    error: String
}

export const meta = {}

export default gs1SyncStateSchema
