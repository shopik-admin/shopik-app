import apiReq from 'common/functions/apiReq'

/**
 * Remove this browser's push binding before logout.
 *
 * Shared store computers are the reason this exists: the next admin to log in
 * must not receive the previous admin's notifications. Bounded by a timeout so
 * a stuck service worker can never block the logout itself.
 */
export async function unsubscribeCurrentPush(timeoutMs = 2500) {
    try {
        if (!('serviceWorker' in navigator)) return
        const registration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
        ])
        const subscription = await registration.pushManager.getSubscription()
        if (!subscription) return
        await apiReq('push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => { })
        await subscription.unsubscribe().catch(() => { })
    } catch {
        // Logout proceeds regardless.
    }
}
