// Full GS1 payload store — one doc per GTIN. Keeps the heavy supplier JSON
// (nutrition tables, EU fields, media metadata) out of the Product collection.
// Product keeps only light pointers: gs1ProductCode + gs1SyncedAt.

const gs1ProductSchema = {
    barcode: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        filter: true
    },
    productCode: {
        type: String,
        trim: true,
        index: true
    },
    modificationTime: Date,
    assetCount: Number,
    // Pipeline status: fetched (raw dumped, awaiting enrich) → enriched | skipped:<reason>
    status: {
        type: String,
        default: 'fetched',
        index: true,
        filter: true
    },
    skipReason: String,
    // Set when the zip is staged, so enrich can process images without GS1 calls.
    fingerprint: String,
    stagingPath: String,
    imagesDone: Boolean,
    raw: {},
    syncedAt: {
        type: Date,
        default: Date.now
    }
}

export const meta = {}

export default gs1ProductSchema
