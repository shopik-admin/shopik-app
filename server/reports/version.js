import { createHash } from 'node:crypto'

/**
 * Cheap fingerprint of everything the catalog report is built from.
 *
 * Reusing a produced file must be instant, so this deliberately avoids reading
 * the 20k comax rows: it costs a handful of indexed reads (counts, the newest
 * updatedAt, the two sync watermarks, the store list).
 *
 *   comax_products  count + newest updatedAt   (any import / edit)
 *   products        count + newest updatedAt   (GS1 enrich, admin price edit)
 *   gs1_products    count
 *   sync states     last completed run         (nightly syncs)
 *   stores          active store list          (columns are per store)
 *
 * Any of those moving means the report is rebuilt; the row hash then decides
 * whether the file actually changed.
 */
export default async function sourceVersion(DL) {
    const [
        domain,
        stores,
        comaxCount,
        comaxLast,
        productCount,
        productLast,
        gs1Count,
        comaxSync,
        gs1Sync
    ] = await Promise.all([
        DL.Domain.readOne({ isDefault: true, active: true }, { _id: 0, id: 1 }),
        DL.Store.Model.find({ active: { $ne: false } }, { _id: 0, id: 1, name: 1 }).sort({ createdAt: 1 }).lean(),
        DL.ComaxProduct.Model.countDocuments({ active: { $ne: false }, isTrailingItem: { $ne: true } }),
        DL.ComaxProduct.Model.findOne({}, { _id: 0, updatedAt: 1 }).sort({ updatedAt: -1 }).lean(),
        DL.Product.Model.countDocuments({}),
        DL.Product.Model.findOne({}, { _id: 0, updatedAt: 1 }).sort({ updatedAt: -1 }).lean(),
        DL.Gs1Product.Model.countDocuments({}),
        DL.ComaxSyncState.readOne({ key: 'products' }, { _id: 0, finishedAt: 1 }),
        DL.Gs1SyncState.readOne({ key: 'watermark' }, { _id: 0, lastSyncAt: 1 })
    ])

    const parts = [
        domain?.id || '',
        stores.map(s => `${s.id}:${s.name}`).join(','),
        comaxCount,
        comaxLast?.updatedAt?.toISOString?.() || '',
        productCount,
        productLast?.updatedAt?.toISOString?.() || '',
        gs1Count,
        comaxSync?.finishedAt?.toISOString?.() || '',
        gs1Sync?.lastSyncAt?.toISOString?.() || ''
    ]

    return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 20)
}
