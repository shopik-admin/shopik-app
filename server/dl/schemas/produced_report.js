/**
 * produced_report — one row per generated report file (see server/reports).
 *
 * `key` = `<type>:<dataHash>` is unique: two requests that would produce the
 * same bytes resolve to the same document and the same uploaded object, so a
 * second admin asking for an unchanged report just gets the existing link.
 *
 * `sourceVersion` is the cheap fingerprint of the source collections used for
 * the fast path (no data read at all) — see server/reports/version.js.
 */
const producedReportSchema = {
    // Report type id from the server registry (server/reports/index.js).
    type: { type: String, required: true, filter: true },
    key: { type: String, required: true, unique: true, trim: true, filter: true },

    sourceVersion: { type: String, filter: true },
    dataHash: String,

    // Normalized request params. The catalog report takes none, date-ranged
    // reports will store { from, to } here.
    params: Object,

    rowCount: Number,
    columnCount: Number,

    // Object path inside UPLOAD_BUCKET, plus the name offered on download.
    filePath: String,
    fileName: String,
    sizeBytes: Number,

    generatedBy: String,
    generatedByName: String
}

export const meta = {}

export default producedReportSchema
