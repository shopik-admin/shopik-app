import { createHash } from 'node:crypto'
import storage from '#server/external/storage.js'
import { getReport } from '#server/reports/index.js'
import reportResult from '#server/reports/result.js'
import sourceVersion from '#server/reports/version.js'
import buildXlsx from '#server/reports/xlsx.js'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function toDate(value) {
    if (!value) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

// Date-ranged reports declare `dateRange: true` and receive { from, to };
// snapshot reports (the catalog) take nothing.
function requestParams(report, payload) {
    if (!report.dateRange) return {}
    const from = toDate(payload.from)
    const to = toDate(payload.to)
    if (!from) throw { status: 400, message: 'from date is required for this report' }
    if (to && to < from) throw { status: 400, message: 'to date must be after the from date' }
    return { from: from.toISOString(), to: to?.toISOString() || null }
}

function fileName(report) {
    const stamp = new Date().toISOString().slice(0, 10).split('-').reverse().join('-')
    return `${report.fileName} ${stamp}.xlsx`
}

function adminName(admin) {
    return `${admin?.name?.first ?? ''} ${admin?.name?.last ?? ''}`.trim()
}

/**
 * Produce (or reuse) a report file.
 *
 * Three levels of reuse, cheapest first:
 *   1. same sourceVersion  → the sources did not move since the last file,
 *      return it without reading a single report row;
 *   2. same row hash       → the sources moved but the rows are identical,
 *      keep the existing file and just move it to the current version;
 *   3. otherwise           → build, upload, store one doc per unique file.
 *
 * `force: true` skips (1) only, so an admin can refresh a report after a
 * manual change that does not touch the sync watermarks.
 */
export default async function runReport(payload, { DL, _admin }) {
    const report = getReport(payload?.type)
    const params = requestParams(report, payload || {})
    const version = await sourceVersion(DL)

    if (!payload?.force) {
        const current = await DL.ProducedReport.Model
            .findOne({ type: report.id, sourceVersion: version })
            .sort({ createdAt: -1 })
            .lean()
        if (current?.filePath) return reportResult(current, true)
    }

    const { columns, rows } = await report.build(DL, params)
    const headers = columns.map(column => column.text)

    const dataHash = createHash('sha1')
        .update(JSON.stringify([report.id, params, headers, rows]))
        .digest('hex')
    const key = `${report.id}:${dataHash}`

    const existing = await DL.ProducedReport.readOne({ key }, { _id: 0 })
    if (existing?.filePath) {
        await DL.ProducedReport.Model.updateOne({ id: existing.id }, { $set: { sourceVersion: version } })
        return reportResult(existing, true)
    }

    const buffer = await buildXlsx({ columns, rows, sheetName: report.sheetName || report.fileName })
    const filePath = `reports/${report.id}/${dataHash}.xlsx`

    await storage.uploadFile({
        path: filePath,
        data: buffer,
        contentType: XLSX_MIME,
        cacheControl: 'private, max-age=0'
    })

    const doc = {
        type: report.id,
        key,
        sourceVersion: version,
        dataHash,
        params,
        rowCount: rows.length,
        columnCount: columns.length,
        filePath,
        fileName: fileName(report),
        sizeBytes: buffer.length,
        generatedBy: _admin?.id || '',
        generatedByName: adminName(_admin)
    }

    try {
        await DL.ProducedReport.create(doc)
    } catch (error) {
        // Two identical requests racing: the other one already stored the doc
        // (and the same bytes at the same object path).
        if (error?.status !== 409) throw error
        const concurrent = await DL.ProducedReport.readOne({ key }, { _id: 0 })
        if (!concurrent?.filePath) throw error
        return reportResult(concurrent, true)
    }

    const saved = await DL.ProducedReport.readOne({ key }, { _id: 0 })
    if (!saved) throw { status: 500, message: 'Report was stored but could not be read back' }
    return reportResult(saved, false)
}

runReport.config = {
    permissions: ['report:run'],
    required: ['type']
}
