import { pipeline } from 'node:stream/promises'
import storage from '#server/external/storage.js'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Content-Disposition needs an ASCII fallback plus the real (Hebrew) name.
function contentDisposition(name) {
    const fileName = String(name || 'report.xlsx')
    const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

/**
 * Stream a produced report to the admin.
 *
 * The xlsx lives in the private upload bucket and this route is the only way
 * out of it — the files are not public, because they carry buying prices.
 * Reachable by GET (`<a href>` download) and POST (`{ id }`) alike.
 */
export default async function downloadReport(payload, { DL, res, query }) {
    const id = payload?.id || query?.id
    if (!id) throw { status: 400, message: 'Report id is required' }

    const doc = await DL.ProducedReport.readOne({ id: String(id) }, { _id: 0 })
    if (!doc?.filePath) throw { status: 404, message: 'Report not found' }

    if (!await storage.fileExists(doc.filePath))
        throw { status: 404, message: 'Report file is missing from storage' }

    res.setHeader('Content-Type', XLSX_MIME)
    res.setHeader('Content-Disposition', contentDisposition(doc.fileName))
    res.setHeader('Cache-Control', 'private, no-store')
    if (doc.sizeBytes) res.setHeader('Content-Length', doc.sizeBytes)

    try {
        await pipeline(storage.getFileStream(doc.filePath), res)
    } catch (error) {
        // The response is already on the wire — the only thing left is to cut it.
        if (!res.headersSent) throw { status: 404, message: 'Report download failed' }
        res.destroy(error)
    }
}

downloadReport.config = {
    permissions: ['report:read'],
    log: false
}
