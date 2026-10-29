/**
 * One produced report, in the shape the admin page renders.
 *
 * The link points at our own authenticated download route: the file holds
 * buying prices, so it must not be a public bucket URL.
 */
export default function reportResult(doc, reused = false) {
    return {
        id: doc.id,
        type: doc.type,
        url: `/api/report/download?id=${encodeURIComponent(doc.id)}`,
        fileName: doc.fileName,
        rowCount: doc.rowCount ?? null,
        columnCount: doc.columnCount ?? null,
        sizeBytes: doc.sizeBytes ?? null,
        generatedAt: doc.createdAt ?? doc.generatedAt ?? null,
        generatedByName: doc.generatedByName || '',
        reused: !!reused
    }
}
