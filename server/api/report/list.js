import reportResult from '#server/reports/result.js'

// Recently produced reports, newest first — the page shows the history of the
// selected report type and links straight to the stored files.
export default async function listReports(payload, { DL }) {
    const type = payload?.type ? String(payload.type) : null
    const limit = Math.min(Math.max(Number(payload?.limit) || 20, 1), 100)

    const docs = await DL.ProducedReport.Model
        .find(type ? { type } : {}, { _id: 0 })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()

    return docs.map(doc => reportResult(doc))
}

listReports.config = {
    permissions: ['report:read']
}
