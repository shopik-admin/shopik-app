import crypto from 'node:crypto'
import storeScope from '#server/utils/data/storeScope.js'
import log from '#server/utils/log.js'

// Admin push events.
//
// Two events, both fail-open: an order that was paid or packed must never be
// held up because a notification could not be written or delivered. Every entry
// point wraps these helpers in try/catch as well, so a bug here is a missing
// notification, not a failed order.

export const JERUSALEM_TZ = 'Asia/Jerusalem'
export const NEW_ORDER_CUTOFF_HOUR = 7
const WINDOW_READY_TTL_SECONDS = 7 * 24 * 60 * 60
const READY_STATUSES = ['packed', 'shipped', 'done']
const INACTIVE_STATUSES = ['cart', 'canceled', 'failed']

/** The business day in Israel, as the YYYY-MM-DD string windows use. */
export function jerusalemDate(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: JERUSALEM_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date)
}

/** Hour of day (0-23) in Israel. */
export function jerusalemHour(date = new Date()) {
    const value = new Intl.DateTimeFormat('en-GB', {
        timeZone: JERUSALEM_TZ,
        hour: '2-digit',
        hourCycle: 'h23'
    }).format(date)
    return Number(value)
}

export function isNewTodayOrderEligible(order, now = new Date()) {
    if (!order?.storeId) return false
    const date = order.window?.date
    if (!date) return false
    if (date !== jerusalemDate(now)) return false
    return jerusalemHour(now) >= NEW_ORDER_CUTOFF_HOUR
}

export function formatWindowRange(window) {
    if (window?.start == null || window?.end == null) return ''
    const hour = value => `${String(value).padStart(2, '0')}:00`
    return `${hour(window.start)}–${hour(window.end >= 24 ? 24 : window.end)}`
}

/** A stable fingerprint of the active orders that make a window ready. */
export function windowReadySignature(orderIds = []) {
    const ids = [...orderIds].map(String).sort()
    return crypto.createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 24)
}

function matchesDomain(admin, domainId) {
    if (!domainId) return true
    if (!admin?.domainIds?.length) return true
    return admin.domainIds.includes(domainId)
}

/**
 * Admins who should receive an event for one store.
 *
 * Mirrors the ops queue rule: a manager (`*:manage`) sees every store in their
 * scope, while a worker sees only the store they are currently working in.
 * `permissions` is the worker permission and `managePermissions` the manager
 * one, so the caller states the audience rather than the store rule.
 */
export async function resolveAdminRecipients({ DL, domainId, storeId, permissions = [], managePermissions = [] }) {
    if (!storeId) return []

    const roles = await DL.Role.read({}, { id: 1, permissions: 1 }, { limit: 0 })
    const rolesById = new Map((roles || []).map(role => [role.id, role]))
    const audience = [...permissions, ...managePermissions]
    const matchingRoleIds = (roles || [])
        .filter(role => role.permissions?.includes('admin:super') ||
            audience.some(permission => role.permissions?.includes(permission)))
        .map(role => role.id)

    if (!matchingRoleIds.length) return []

    // `active` is filtered in JS on purpose: Admin is a cached (hashset) model and
    // the cache matcher does not understand `$ne`, so an `active: { $ne: false }`
    // filter would silently return no admins whenever Redis is warm.
    const admins = await DL.Admin.read(
        { roleId: { $in: matchingRoleIds } },
        { id: 1, name: 1, roleId: 1, storeIds: 1, currentStoreId: 1, domainIds: 1, active: 1 },
        { limit: 0 }
    )

    return (admins || []).filter(admin => {
        if (admin.active === false) return false
        if (!matchesDomain(admin, domainId)) return false

        const role = rolesById.get(admin.roleId)
        const isSuperAdmin = Boolean(role?.permissions?.includes('admin:super'))
        const hasPermission = permission => isSuperAdmin || Boolean(role?.permissions?.includes(permission))

        if (managePermissions.some(hasPermission)) {
            const scope = storeScope({
                _admin: { isSuperAdmin, hasPermission, storeIds: admin.storeIds }
            })
            if (scope === null || scope.includes(storeId)) return true
        }

        if (permissions.some(hasPermission) && admin.currentStoreId === storeId) return true

        return false
    })
}

/**
 * Create one inbox row per recipient. Returns only the rows that were actually
 * inserted, so a retried event never re-sends a push for a row that already
 * exists (the unique adminId+dedupeKey index is the final guard).
 */
export async function createInboxNotifications({ DL, recipients, notification }) {
    const created = []
    for (const admin of recipients) {
        try {
            const row = await DL.AdminNotification.create({
                adminId: admin.id,
                domainId: notification.domainId,
                storeId: notification.storeId,
                type: notification.type,
                level: notification.level,
                title: notification.title,
                body: notification.body,
                url: notification.url,
                orderId: notification.orderId,
                orderNumber: notification.orderNumber,
                windowDate: notification.window?.date,
                windowStart: notification.window?.start,
                windowEnd: notification.window?.end,
                dedupeKey: notification.dedupeKey
            })
            created.push({ admin, row })
        } catch (e) {
            // 409 = the same admin already has this event (concurrent worker).
            if (e?.status !== 409)
                log.warn('[Push] Could not create inbox notification:', e?.message || e)
        }
    }
    return created
}

function orderNumberText(order) {
    return order?.number != null ? `#${order.number}` : ''
}

function joinParts(parts) {
    return parts.filter(Boolean).join(' · ')
}

async function storeName(DL, storeId) {
    if (!storeId) return ''
    try {
        const store = await DL.Store.readById(storeId, { name: 1 })
        return store?.name || ''
    } catch {
        return ''
    }
}

async function deliver({ DL, external, created, payload, options }) {
    if (!created.length) return { created: 0, sent: 0 }
    const adminIds = created.map(({ admin }) => admin.id)
    let pushResult = { sent: 0 }
    try {
        pushResult = await external?.push?.sendToAdmins({
            domainId: payload.domainId,
            adminIds,
            payload: {
                title: payload.title,
                body: payload.body,
                url: payload.url,
                tag: payload.dedupeKey,
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-192.png'
            },
            options
        })
    } catch (e) {
        log.warn('[Push] Send failed:', e?.message || e)
    }

    if (pushResult?.sent) {
        await Promise.all(created.map(({ row }) =>
            DL.AdminNotification.updateOne(
                { id: row.id },
                { $set: { pushedAt: new Date() } }
            ).catch(() => { })
        ))
    }

    return { created: created.length, sent: pushResult?.sent || 0 }
}

/**
 * Event 1 — an order for today was paid after 07:00.
 * Audience: pickers and branch managers of the order's store.
 */
export async function notifyNewTodayOrder({ DL, external, order, now = new Date() }) {
    if (!isNewTodayOrderEligible(order, now))
        return { skipped: 'not-eligible' }

    // Atomic marker: a retried callback finds it already set and stops here.
    const marked = await DL.Order.updateOne(
        { id: order.id, 'notifications.adminPush.newTodayOrderAt': { $exists: false } },
        { $set: { 'notifications.adminPush.newTodayOrderAt': now } }
    )
    if (!marked) return { skipped: 'already-notified' }

    try {
        const recipients = await resolveAdminRecipients({
            DL,
            domainId: order.domainId,
            storeId: order.storeId,
            permissions: ['order:pick'],
            managePermissions: ['order:pick:manage']
        })
        if (!recipients.length) return { skipped: 'no-recipients' }

        const store = await storeName(DL, order.storeId)
        const range = formatWindowRange(order.window)
        const title = 'הזמנה חדשה להיום'
        const body = joinParts([orderNumberText(order), range, store])
        const url = `/ops-order/${order.id}`

        const created = await createInboxNotifications({
            DL,
            recipients,
            notification: {
                domainId: order.domainId,
                storeId: order.storeId,
                type: 'new_today_order',
                level: 'info',
                title,
                body,
                url,
                orderId: order.id,
                orderNumber: order.number != null ? String(order.number) : undefined,
                window: order.window,
                dedupeKey: `new-today-order:${order.id}`
            }
        })

        return await deliver({
            DL,
            external,
            created,
            payload: {
                domainId: order.domainId,
                title,
                body,
                url,
                dedupeKey: `new-today-order:${order.id}`
            },
            options: { ttl: 60 * 60, urgency: 'high' }
        })
    } catch (e) {
        // The marker stays set: a duplicate is worse than a missed notification
        // for the same order, and the inbox row is what the bell reads.
        log.warn('[Push] New-order notification failed:', e?.message || e)
        return { skipped: 'error' }
    }
}

/**
 * Event 2 — every active delivery order in a window is ready for pickup.
 * Audience: shippers and contractors of the window's store.
 */
export async function notifyWindowReady({ DL, external, order, now = new Date() }) {
    const window = order?.window
    if (!order?.storeId || !window?.date || window.start == null || window.end == null)
        return { skipped: 'no-window' }

    const active = await DL.Order.Model.find({
        storeId: order.storeId,
        'window.date': window.date,
        'window.start': window.start,
        'window.end': window.end,
        deliveryMethod: 'delivery',
        status: { $nin: INACTIVE_STATUSES }
    }).select({ _id: 0, id: 1, status: 1 }).lean()

    if (!active.length) return { skipped: 'empty-window' }
    if (!active.every(item => READY_STATUSES.includes(item.status)))
        return { skipped: 'not-ready' }
    // Every order already moved on — the ready state was announced earlier and
    // there is nothing left to pick up.
    if (!active.some(item => item.status === 'packed'))
        return { skipped: 'already-advanced' }

    const signature = windowReadySignature(active.map(item => item.id))
    const dedupeKey = `window-ready:${order.storeId}:${window.date}:${window.start}:${window.end}:${signature}`
    const redisKey = `admin_push:${order.domainId}:${dedupeKey}`

    if (DL.redis) {
        try {
            const fresh = await DL.redis.set(redisKey, '1', 'EX', WINDOW_READY_TTL_SECONDS, 'NX')
            if (!fresh) return { skipped: 'already-sent', signature }
        } catch {
            // Fail-open: without Redis the inbox unique index still prevents
            // duplicate rows, and a duplicate push is preferable to silence.
        }
    }

    try {
        await DL.Order.Model.updateMany(
            { id: { $in: active.map(item => item.id) } },
            {
                $set: {
                    'notifications.adminPush.windowReadySignature': signature,
                    'notifications.adminPush.windowReadyAt': now
                }
            }
        ).catch(() => { })

        const recipients = await resolveAdminRecipients({
            DL,
            domainId: order.domainId,
            storeId: order.storeId,
            permissions: ['order:ship'],
            managePermissions: ['order:ship:manage']
        })
        if (!recipients.length) {
            // Nobody to notify: release the marker so a later transition in the
            // same window retries once a shipper or manager exists.
            if (DL.redis) await DL.redis.del(redisKey).catch(() => { })
            return { skipped: 'no-recipients', signature }
        }

        const store = await storeName(DL, order.storeId)
        const range = formatWindowRange(window)
        const title = 'חלון מוכן לאיסוף'
        const body = joinParts([store, range, `${active.length} הזמנות מוכנות`])
        const url = '/ops'

        const created = await createInboxNotifications({
            DL,
            recipients,
            notification: {
                domainId: order.domainId,
                storeId: order.storeId,
                type: 'window_ready',
                level: 'success',
                title,
                body,
                url,
                window,
                dedupeKey
            }
        })

        return await deliver({
            DL,
            external,
            created,
            payload: { domainId: order.domainId, title, body, url, dedupeKey },
            options: { ttl: 6 * 60 * 60, urgency: 'normal' }
        })
    } catch (e) {
        // Release the signature so the next transition can retry the event.
        if (DL.redis) await DL.redis.del(redisKey).catch(() => { })
        log.warn('[Push] Window-ready notification failed:', e?.message || e)
        return { skipped: 'error' }
    }
}
