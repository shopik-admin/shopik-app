// Admin report types.
//
// These ids must match the server registry in server/reports/index.js — the
// server owns the generation, this list only tells the page what it may ask
// for (and whether the type uses a date range).
export const REPORTS = [
    { id: 'catalog', text: 'reports_catalog_name', dateRange: false }
]

export default REPORTS
