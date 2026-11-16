export default async function status(payload, { DL, _admin, external }) {
    const enabled = Boolean(external?.push?.enabled)
    const endpoint = typeof payload.endpoint === 'string' ? payload.endpoint.trim() : ''

    let subscribed = false
    if (enabled && endpoint) {
        const subscription = await DL.PushSubscription.readOne({
            endpoint,
            adminId: _admin.id,
            domainId: payload.domainId,
            platform: 'admin'
        }, { _id: 0, id: 1, disabledAt: 1 })
        subscribed = Boolean(subscription && !subscription.disabledAt)
    }

    return {
        enabled,
        publicKey: external?.push?.publicKey || '',
        subscribed
    }
}

status.config = {
    auth: 'required'
}
