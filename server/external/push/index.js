import webpush from 'web-push'
import pLimit from 'p-limit'
import log from '#server/utils/log.js'

const DEFAULT_TTL = 60 * 60
const SEND_TIMEOUT_MS = 10 * 1000
const MAX_CONCURRENCY = 10
// How long a subscription may keep failing before the cleanup cron removes it.
export const PUSH_FAILURE_LIMIT = 20

/**
 * Web Push sender.
 *
 * VAPID keys are global environment values. When they are missing the feature
 * is disabled instead of failing the request that triggered a notification:
 * push is a convenience, never a prerequisite for the order flow.
 */
export default function pushFactory({ DL }) {
    const publicKey = process.env.VAPID_PUBLIC_KEY || ''
    const privateKey = process.env.VAPID_PRIVATE_KEY || ''
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@shopik.co.il'

    let enabled = Boolean(publicKey && privateKey)
    if (enabled) {
        try {
            webpush.setVapidDetails(subject, publicKey, privateKey)
        } catch (e) {
            enabled = false
            log.warn('[Push] VAPID configuration is invalid, push disabled:', e?.message || e)
        }
    } else {
        log.warn('[Push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY missing, push disabled.')
    }

    async function sendToSubscription(subscription, payload, options = {}) {
        return webpush.sendNotification(
            { endpoint: subscription.endpoint, keys: subscription.keys },
            JSON.stringify(payload),
            {
                TTL: options.ttl ?? DEFAULT_TTL,
                urgency: options.urgency ?? 'normal',
                timeout: options.timeout ?? SEND_TIMEOUT_MS
            }
        )
    }

    async function recordFailure(subscription, error) {
        const status = Number(error?.statusCode) || 0
        if (status === 404 || status === 410) {
            // The browser threw the subscription away. Keeping the row would only
            // keep failing on every future send.
            await DL.PushSubscription.deleteOne({ id: subscription.id }).catch(() => { })
            return
        }
        await DL.PushSubscription.updateOne(
            { id: subscription.id },
            {
                $set: {
                    lastFailureAt: new Date(),
                    lastError: String(error?.body || error?.message || error).slice(0, 300)
                },
                $inc: { failureCount: 1 }
            }
        ).catch(() => { })
        if (status === 401 || status === 403)
            log.warn('[Push] Provider rejected VAPID credentials:', status)
    }

    async function sendToAdmins({ domainId, adminIds, payload, options = {} }) {
        if (!enabled) return { sent: 0, failed: 0, skipped: 'disabled' }
        if (!adminIds?.length) return { sent: 0, failed: 0, skipped: 'no-recipients' }

        const subscriptions = await DL.PushSubscription.read(
            {
                adminId: { $in: adminIds },
                domainId,
                platform: 'admin',
                disabledAt: null
            },
            { _id: 0 },
            { limit: 0 }
        )

        if (!subscriptions?.length) return { sent: 0, failed: 0, skipped: 'no-subscriptions' }

        const limit = pLimit(MAX_CONCURRENCY)
        let sent = 0
        let failed = 0

        await Promise.all(subscriptions.map(subscription => limit(async () => {
            try {
                await sendToSubscription(subscription, payload, options)
                sent++
                await DL.PushSubscription.updateOne(
                    { id: subscription.id },
                    {
                        $set: {
                            lastSuccessAt: new Date(),
                            lastFailureAt: null,
                            lastError: null,
                            failureCount: 0
                        }
                    }
                ).catch(() => { })
            } catch (error) {
                failed++
                await recordFailure(subscription, error)
            }
        })))

        return { sent, failed }
    }

    return {
        enabled,
        publicKey,
        sendToSubscription,
        sendToAdmins
    }
}
