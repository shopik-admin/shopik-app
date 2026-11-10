import { notificationSources } from '#server/services/notifications/index.js'

// POST /api/notifications/counts → { counts: { [key]: number } }
// Runs every source the current admin may see. A failing source reports 0
// instead of breaking the whole badge bar.
export default async function notificationCounts(payload, { DL, _admin }) {
    const counts = {}
    await Promise.all(notificationSources.map(async source => {
        if (source.permission && !_admin?.hasPermission?.(source.permission)) return
        try {
            counts[source.key] = await source.count({ DL })
        } catch {
            counts[source.key] = 0
        }
    }))
    return { counts }
}

notificationCounts.config = {
    required: [],
    auth: 'required'
}
