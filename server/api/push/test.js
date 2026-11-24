import { pushIconsFor, pushText } from '#server/utils/data/adminPush.js'

export default async function test(payload, { DL, _admin, external }) {
    if (!external?.push?.enabled)
        throw { status: 400, message: 'push is not configured' }

    // The test notification is for the admin who asked for it, so it speaks
    // their language — same rule as every other push.
    const languageCode = _admin.languageCode || 'he'
    const title = await pushText({ DL, languageCode, key: 'push_test_title' })
    const body = await pushText({ DL, languageCode, key: 'push_test_body' })
    const icons = await pushIconsFor({ DL, domainId: payload.domainId })

    const result = await external.push.sendToAdmins({
        domainId: payload.domainId,
        adminIds: [_admin.id],
        payload: {
            title,
            body,
            url: '/ops',
            tag: `push-test-${Date.now()}`,
            ...icons
        },
        options: { ttl: 5 * 60, urgency: 'normal' }
    })

    if (!result?.sent) throw { status: 400, message: 'no active subscription' }
    return result
}

test.config = {
    permissions: ['push:send']
}
