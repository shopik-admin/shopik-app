export function userActor(_user) {
    if (!_user) return null
    return {
        role: 'user',
        name: `${_user.name?.first ?? ''} ${_user.name?.last ?? ''}`.trim(),
        id: _user.id
    }
}

export function adminActor(_admin) {
    if (!_admin) return null
    return {
        role: 'admin',
        name: `${_admin.name?.first ?? ''} ${_admin.name?.last ?? ''}`.trim(),
        id: _admin.id
    }
}

export async function record({
    DL,
    order,
    eventType,
    actor = null,
    changes = null,
    context = null,
    outcome = null,
    metadata = null
}) {
    if (!order?.id || !eventType) return null

    const entry = {
        orderId: order.id,
        actor,
        event: {
            type: eventType,
            category: eventType
        },
        outcome: {
            success: true,
            ...(outcome || {})
        },
        changes,
        context,
        metadata
    }

    try {
        return await DL.Timeline.create(entry)
    } catch (error) {
        console.error('timeline.record failed:', error)
        return null
    }
}