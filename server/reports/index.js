import catalog from './catalog.js'

/**
 * Registry of runnable reports.
 *
 * Adding a report = one file here with { id, fileName, sheetName, dateRange,
 * build(DL, params) } plus an entry in common/constants/reports.js so the admin
 * page can list it. report/run refuses any id that is not in this map.
 */
const reports = new Map([[catalog.id, catalog]])

export function getReport(type) {
    const report = reports.get(String(type || ''))
    if (!report) throw { status: 400, message: `Unknown report type: ${type || '(missing)'}` }
    return report
}
