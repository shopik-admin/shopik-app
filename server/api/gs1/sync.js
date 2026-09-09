import { startRun } from '#server/services/gs1/sync.js'

// POST /api/gs1/sync {from?, to?, onlyInStock?, forceImages?}
// Bootstrap: omit from/to on first run (pages history from GS1_BOOTSTRAP_FROM).
// Incremental: omit from/to afterwards (resumes from watermark).
export default async function gs1Sync(payload, { DL, external }) {
    return startRun(payload || {}, { DL, external })
}

gs1Sync.config = {
    required: [],
    permissions: ['product:update'],
    auth: 'required',
    preventMultiple: true
}
