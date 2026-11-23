export default async function inbox(payload, { DL, _admin }) {
    const requested = Number(payload.limit)
    const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 20, 1), 50)

    const filter = { adminId: _admin.id }
    if (payload.domainId) filter.domainId = payload.domainId

    const [items, unread] = await Promise.all([
        DL.AdminNotification.read(
            filter,
            { _id: 0, adminId: 0, domainId: 0 },
            { sort: { createdAt: -1 }, limit }
        ),
        DL.AdminNotification.count({ ...filter, readAt: null })
    ])

    return { items, unread }
}

inbox.config = {
    auth: 'required'
}
