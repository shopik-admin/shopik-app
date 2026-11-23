import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    clearPushTextCache,
    isNewTodayOrderEligible,
    jerusalemDate,
    jerusalemHour,
    pushText,
    windowReadySignature,
    resolveAdminRecipients,
    notifyNewTodayOrder,
    notifyWindowReady
} from '../../server/utils/data/adminPush.js'

const TODAY = '2026-11-16'
// 2026-11-16 is winter time in Israel (UTC+2): 05:00Z = 07:00 local.
const AFTER_SEVEN = new Date('2026-11-16T05:00:00Z')
const BEFORE_SEVEN = new Date('2026-11-16T04:59:00Z')

const roles = [
    { id: 'role-manager', permissions: ['order:pick:manage', 'order:ship:manage'] },
    { id: 'role-picker', permissions: ['order:pick'] },
    { id: 'role-shipper', permissions: ['order:ship'] },
    { id: 'role-super', permissions: ['admin:super'] }
]

function recipientAdmins() {
    return [
        { id: 'manager-s1', roleId: 'role-manager', storeIds: ['s1'], domainIds: ['d1'] },
        { id: 'manager-s2', roleId: 'role-manager', storeIds: ['s2'], domainIds: ['d1'] },
        { id: 'picker-s1', roleId: 'role-picker', currentStoreId: 's1', domainIds: ['d1'] },
        { id: 'picker-s2', roleId: 'role-picker', currentStoreId: 's2', domainIds: ['d1'] },
        { id: 'shipper-s1', roleId: 'role-shipper', currentStoreId: 's1', domainIds: ['d1'] },
        { id: 'shipper-s2', roleId: 'role-shipper', currentStoreId: 's2', domainIds: ['d1'] },
        { id: 'super', roleId: 'role-super', domainIds: [] },
        { id: 'other-domain', roleId: 'role-manager', storeIds: ['s1'], domainIds: ['d2'] }
    ]
}

function recipientDL(admins = recipientAdmins()) {
    return {
        Role: { read: async () => roles },
        Admin: { read: async () => admins }
    }
}

function baseOrder(overrides = {}) {
    return {
        id: 'order-1',
        number: 1234,
        storeId: 's1',
        domainId: 'd1',
        status: 'paid',
        window: { date: TODAY, start: 14, end: 16 },
        ...overrides
    }
}

function makeInbox() {
    const rows = []
    return {
        rows,
        readOne: async () => null,
        create: async data => {
            const row = { id: `n-${rows.length + 1}`, createdAt: new Date(), ...data }
            rows.push(row)
            return row
        },
        updateOne: async () => ({})
    }
}

describe('admin push event helpers', () => {
    it('resolves the business day and hour in Asia/Jerusalem', () => {
        assert.equal(jerusalemDate(AFTER_SEVEN), TODAY)
        assert.equal(jerusalemHour(AFTER_SEVEN), 7)
        assert.equal(jerusalemDate(new Date('2026-11-16T22:30:00Z')), '2026-11-17')
        assert.equal(jerusalemHour(new Date('2026-11-16T22:30:00Z')), 0)
    })

    it('requires today and 07:00 or later', () => {
        assert.equal(isNewTodayOrderEligible(baseOrder(), AFTER_SEVEN), true)
        assert.equal(isNewTodayOrderEligible(baseOrder(), BEFORE_SEVEN), false)
        assert.equal(isNewTodayOrderEligible(baseOrder({ window: { date: '2026-11-17', start: 14, end: 16 } }), AFTER_SEVEN), false)
        assert.equal(isNewTodayOrderEligible(baseOrder({ storeId: '' }), AFTER_SEVEN), false)
        assert.equal(isNewTodayOrderEligible(baseOrder({ window: null }), AFTER_SEVEN), false)
    })

    it('builds a stable window signature independent of order', () => {
        assert.equal(windowReadySignature(['b', 'a']), windowReadySignature(['a', 'b']))
        assert.notEqual(windowReadySignature(['a', 'b']), windowReadySignature(['a', 'c']))
    })

    it('targets managers by store scope and workers by current store', async () => {
        const recipients = await resolveAdminRecipients({
            DL: recipientDL(),
            domainId: 'd1',
            storeId: 's1',
            permissions: ['order:pick'],
            managePermissions: ['order:pick:manage']
        })
        assert.deepEqual(recipients.map(admin => admin.id).sort(), ['manager-s1', 'picker-s1', 'super'])
    })

    it('does not notify an admin assigned to another domain', async () => {
        const recipients = await resolveAdminRecipients({
            DL: recipientDL(),
            domainId: 'd1',
            storeId: 's1',
            permissions: ['order:ship'],
            managePermissions: ['order:ship:manage']
        })
        assert.equal(recipients.some(admin => admin.id === 'other-domain'), false)
    })

    it('creates one inbox row per recipient and sends one push payload', async () => {
        const inbox = makeInbox()
        const pushes = []
        const DL = {
            ...recipientDL(),
            Order: {
                updateOne: async () => baseOrder()
            },
            Store: { readById: async () => ({ id: 's1', name: 'סניף מרכז' }) },
            AdminNotification: inbox
        }
        const external = {
            push: {
                sendToAdmins: async args => {
                    pushes.push(args)
                    return { sent: args.adminIds.length, failed: 0 }
                }
            }
        }

        const result = await notifyNewTodayOrder({ DL, external, order: baseOrder(), now: AFTER_SEVEN })

        assert.equal(result.created, 3)
        assert.equal(inbox.rows.length, 3)
        assert.deepEqual(inbox.rows.map(row => row.adminId).sort(), ['manager-s1', 'picker-s1', 'super'])
        assert.equal(pushes.length, 1)
        assert.equal(pushes[0].payload.title, 'הזמנה חדשה להיום')
        assert.match(pushes[0].payload.body, /#1234/)
        assert.match(pushes[0].payload.body, /14:00–16:00/)
        assert.match(pushes[0].payload.body, /סניף מרכז/)
        assert.equal(pushes[0].payload.url, '/ops-order/order-1')
        // No customer personal data in the payload.
        assert.equal(/phone|address|customer/i.test(pushes[0].payload.body), false)
    })

    it('writes and pushes each recipient language', async () => {
        clearPushTextCache()
        const inbox = makeInbox()
        const admins = [
            { id: 'picker-en', roleId: 'role-picker', currentStoreId: 's1', domainIds: ['d1'], languageCode: 'en' },
            { id: 'picker-he', roleId: 'role-picker', currentStoreId: 's1', domainIds: ['d1'] }
        ]
        const DL = {
            ...recipientDL(admins),
            TranslationLanguage: {
                readOne: async ({ code }) => code === 'en'
                    ? { code: 'en', name: 'english', nativeName: 'English', direction: 'ltr' }
                    : null
            },
            TranslationDictionary: {
                readOne: async ({ languageCode }) => ({
                    texts: languageCode === 'en'
                        ? { push_new_order_title: 'New order today' }
                        : {}
                })
            },
            Order: { updateOne: async () => baseOrder() },
            Store: { readById: async () => ({ id: 's1', name: 'Center' }) },
            AdminNotification: inbox
        }
        const pushes = []
        const external = { push: { sendToAdmins: async args => { pushes.push(args); return { sent: 1 } } } }

        await notifyNewTodayOrder({ DL, external, order: baseOrder(), now: AFTER_SEVEN })

        assert.equal(inbox.rows.length, 2)
        assert.equal(inbox.rows.find(row => row.adminId === 'picker-en').title, 'New order today')
        assert.equal(inbox.rows.find(row => row.adminId === 'picker-he').title, 'הזמנה חדשה להיום')

        // One payload per language, never the same admin twice.
        assert.equal(pushes.length, 2)
        const titles = pushes.map(push => push.payload.title).sort()
        assert.deepEqual(titles, ['New order today', 'הזמנה חדשה להיום'].sort())
        assert.deepEqual(
            pushes.flatMap(push => push.adminIds).sort(),
            ['picker-en', 'picker-he']
        )
        clearPushTextCache()
    })

    it('falls back to the Hebrew copy when a translation is missing', async () => {
        clearPushTextCache()
        // No dictionary models at all: an unknown language must still notify.
        assert.equal(
            await pushText({ DL: {}, languageCode: 'fr', key: 'push_new_order_title' }),
            'הזמנה חדשה להיום'
        )
        assert.equal(await pushText({ DL: {}, languageCode: 'fr', key: 'push_missing_key' }), 'push_missing_key')
        clearPushTextCache()
    })

    it('does not notify twice for the same order', async () => {
        const inbox = makeInbox()
        let marked = false
        const DL = {
            ...recipientDL(),
            Order: {
                updateOne: async () => {
                    if (marked) return null
                    marked = true
                    return baseOrder()
                }
            },
            Store: { readById: async () => ({ name: 'סניף' }) },
            AdminNotification: inbox
        }
        const external = { push: { sendToAdmins: async () => ({ sent: 0 }) } }

        const first = await notifyNewTodayOrder({ DL, external, order: baseOrder(), now: AFTER_SEVEN })
        const second = await notifyNewTodayOrder({ DL, external, order: baseOrder(), now: AFTER_SEVEN })

        assert.equal(first.created, 3)
        assert.equal(second.skipped, 'already-notified')
        assert.equal(inbox.rows.length, 3)
    })

    it('skips orders before 07:00 or for another day', async () => {
        const DL = { ...recipientDL(), Order: { updateOne: async () => baseOrder() } }
        const external = { push: { sendToAdmins: async () => ({ sent: 0 }) } }

        assert.equal((await notifyNewTodayOrder({ DL, external, order: baseOrder(), now: BEFORE_SEVEN })).skipped, 'not-eligible')
        const tomorrow = baseOrder({ window: { date: '2026-11-17', start: 14, end: 16 } })
        assert.equal((await notifyNewTodayOrder({ DL, external, order: tomorrow, now: AFTER_SEVEN })).skipped, 'not-eligible')
    })
})

describe('window ready detection', () => {
    function windowDL({ statuses, redisSet = async () => 'OK', admins = recipientAdmins() }) {
        const inbox = makeInbox()
        const orders = statuses.map((status, index) => ({ id: `o${index + 1}`, status }))
        return {
            inbox,
            DL: {
                ...recipientDL(admins),
                Order: {
                    Model: {
                        find: () => ({
                            select: () => ({ lean: async () => orders })
                        }),
                        updateMany: async () => ({ modifiedCount: orders.length })
                    }
                },
                Store: { readById: async () => ({ name: 'סניף מרכז' }) },
                AdminNotification: inbox,
                redis: { set: redisSet, del: async () => 1 }
            }
        }
    }

    it('notifies shippers once every delivery order is ready', async () => {
        const { DL, inbox } = windowDL({ statuses: ['packed', 'shipped', 'done'] })
        const pushes = []
        const external = { push: { sendToAdmins: async args => { pushes.push(args); return { sent: 1 } } } }

        const result = await notifyWindowReady({ DL, external, order: baseOrder({ status: 'packed' }), now: AFTER_SEVEN })

        assert.equal(result.created, 3) // manager-s1, shipper-s1, super
        assert.equal(pushes.length, 1)
        assert.equal(pushes[0].payload.title, 'חלון מוכן לאיסוף')
        assert.match(pushes[0].payload.body, /3 הזמנות מוכנות/)
        assert.equal(pushes[0].payload.url, '/ops')
        assert.ok(inbox.rows.every(row => row.level === 'success'))
    })

    it('does not notify while an order is still being picked', async () => {
        const { DL } = windowDL({ statuses: ['packed', 'picking'] })
        const external = { push: { sendToAdmins: async () => ({ sent: 0 }) } }

        const result = await notifyWindowReady({ DL, external, order: baseOrder(), now: AFTER_SEVEN })
        assert.equal(result.skipped, 'not-ready')
    })

    it('does not notify when every order already moved past packed', async () => {
        const { DL } = windowDL({ statuses: ['shipped', 'done'] })
        const external = { push: { sendToAdmins: async () => ({ sent: 0 }) } }

        const result = await notifyWindowReady({ DL, external, order: baseOrder(), now: AFTER_SEVEN })
        assert.equal(result.skipped, 'already-advanced')
    })

    it('does not notify for an empty window', async () => {
        const { DL } = windowDL({ statuses: [] })
        const external = { push: { sendToAdmins: async () => ({ sent: 0 }) } }

        const result = await notifyWindowReady({ DL, external, order: baseOrder(), now: AFTER_SEVEN })
        assert.equal(result.skipped, 'empty-window')
    })

    it('does not repeat a window that was already announced', async () => {
        const { DL, inbox } = windowDL({ statuses: ['packed'], redisSet: async () => null })
        const external = { push: { sendToAdmins: async () => ({ sent: 0 }) } }

        const result = await notifyWindowReady({ DL, external, order: baseOrder(), now: AFTER_SEVEN })
        assert.equal(result.skipped, 'already-sent')
        assert.equal(inbox.rows.length, 0)
    })
})
