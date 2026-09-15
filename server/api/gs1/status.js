import { getStatus } from '#server/services/gs1/sync.js'

// POST /api/gs1/status {runId?} → run state + queue depths
export default async function gs1Status(payload, { DL }) {
    return getStatus(payload?.runId, { DL })
}

gs1Status.config = {
    required: [],
    permissions: ['product:read'],
    auth: 'required'
}
