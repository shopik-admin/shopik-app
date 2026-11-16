import { validateSubscription } from '#server/utils/push/validateSubscription.js'

const RATE_LIMIT = 20
const RATE_WINDOW_SECONDS = 60

export default async function subscribe(payload, { DL, _admin, external }) {
    if (!external?.push?.enabled)
        throw { status: 400, message: 'push is not configured' }

    // A browser re-subscribes on every login and on pushsubscriptionchange, so
    // the cap is generous — it only stops a loop from filling the collection.
    if (DL.redis) {
        try {
            const key = `push_subscribe:${_admin.id}`
            const count = await DL.redis.incr(key)
            if (count === 1) await DL.redis.expire(key, RATE_WINDOW_SECONDS)
            if (count > RATE_LIMIT) throw { status: 429, message: 'Too Many Requests' }
        } catch (e) {
            if (e?.status === 429) throw e
        }
    }

    const { endpoint, keys, expirationTime } = validateSubscription(payload)
    const now = new Date()
    const data = {
        adminId: _admin.id,
        domainId: payload.domainId,
        platform: 'admin',
        endpoint,
        keys,
        expirationTime,
        userAgent: typeof payload.userAgent === 'string' ? payload.userAgent.slice(0, 300) : undefined,
        deviceLabel: typeof payload.deviceLabel === 'string' ? payload.deviceLabel.slice(0, 80) : undefined,
        lastSeenAt: now,
        disabledAt: null,
        lastError: null,
        failureCount: 0
    }

    const existing = await DL.PushSubscription.readOne({ endpoint }, { _id: 0, id: 1 })
    if (existing) {
        // The endpoint belongs to a browser installation, not to an admin: a
        // shared store computer re-binds it to whoever is logged in now.
        await DL.PushSubscription.updateOne({ id: existing.id }, { $set: data })
        return { subscribed: true }
    }

    try {
        await DL.PushSubscription.create(data)
    } catch (e) {
        if (e?.status !== 409) throw e
        await DL.PushSubscription.updateOne({ endpoint }, { $set: data })
    }

    return { subscribed: true }
}

subscribe.config = {
    auth: 'required',
    required: ['endpoint', 'keys']
}
