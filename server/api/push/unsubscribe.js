export default async function unsubscribe(payload, { DL, _admin }) {
    const endpoint = typeof payload.endpoint === 'string' ? payload.endpoint.trim() : ''
    if (!endpoint) throw { status: 400, message: 'endpoint required' }

    // Only the current admin's binding is removed: another admin on the same
    // browser will re-subscribe on their next login.
    await DL.PushSubscription.deleteOne({ endpoint, adminId: _admin.id })

    return { subscribed: false }
}

unsubscribe.config = {
    auth: 'required',
    required: ['endpoint']
}
