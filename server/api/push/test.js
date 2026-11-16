export default async function test(payload, { DL, _admin, external }) {
    if (!external?.push?.enabled)
        throw { status: 400, message: 'push is not configured' }

    const result = await external.push.sendToAdmins({
        domainId: payload.domainId,
        adminIds: [_admin.id],
        payload: {
            title: 'התראת בדיקה',
            body: 'ההתראות מוגדרות כראוי.',
            url: '/ops',
            tag: `push-test-${Date.now()}`,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png'
        },
        options: { ttl: 5 * 60, urgency: 'normal' }
    })

    if (!result?.sent) throw { status: 400, message: 'no active subscription' }
    return result
}

test.config = {
    permissions: ['push:send']
}
