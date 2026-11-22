// Order-lifecycle simulation: one real order through the app's own write
// routes, from shopper login to a delivered (done) order.
//
// What is real: login/registration, address + service area, cart, delivery
// window, ops claim/picking/packing, shipment start and delivery all go
// through the same routes the apps use. What is simulated: the Hyp payment
// page/redirect. The flow writes the state the callback would write (order
// paid + authorization fields) and, after pick_complete, the CAPTURE
// transaction the pack capture would create — so packing's capture path finds
// the order fully paid and never calls Hyp. No card data and no provider
// traffic is involved.
//
// Writes are gated by config.assertFlowAllowed: --target local only, a
// production shell/SET refuses, and a non-loopback host needs an explicit
// acknowledgement. The flow still creates real documents in that database.

import uid from '#common/functions/uid.js'
import { calcShipping } from '#common/functions/shipping.js'
import { round2, round3 } from '#common/functions/calcOrder/utils.js'
import { normalizePickLimits, DEFAULT_PICK_LIMITS } from '#common/functions/pickLimits.js'
import { decryptDoc, isEncrypted } from '#server/utils/settingsEncryption.js'
import { adminLogin } from './auth.js'
import { CUSTOMER_PLATFORM } from './payloads.js'

const MISSING_REASON = 'stress-flow missing product'
const WEIGHTED_AMOUNT = 0.5

// The user asked for a Jerusalem / Bat Yam / Beitar Illit address. Each group
// carries the spellings a prod dump may hold plus one plain fallback that the
// geocoder almost always resolves. Candidates are tried in order until one
// lands in a service area.
const CITY_GROUPS = [
    {
        label: 'Jerusalem',
        samples: ['ירושלים', 'ירושלם', 'Jerusalem', 'jerusalem'],
        fallback: { city: 'ירושלים', street: 'יפו', building: '1' }
    },
    {
        label: 'Bat Yam',
        samples: ['בת ים', 'בת-ים', 'Bat Yam', 'bat yam'],
        fallback: { city: 'בת ים', street: 'העצמאות', building: '1' }
    },
    {
        label: 'Beitar Illit',
        samples: ['ביתר עילית', 'ביתר עלית', 'Beitar Illit', 'beitar illit'],
        fallback: { city: 'ביתר עילית', street: 'הרי יהודה', building: '1' }
    }
]

// A 1x1 PNG, only used when the flow admin may not skip the delivery photo.
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK2mNwAAAABJRU5ErkJggg=='

export class FlowError extends Error {
    constructor(step, message, steps = []) {
        super(`${step}: ${message}`)
        this.name = 'FlowError'
        this.step = step
        this.steps = steps
    }
}

function isoDate(d) {
    return d.toISOString().split('T')[0]
}

// Raw settings read, decrypted the same way DL.Setting.readOne does (config-typed
// values are stored as enc:… at rest). The default-domain fallback mirrors
// getShippingConfig/getPickLimits on the server.
async function settingValueFor(db, key, domainId, fallbackDomainId) {
    if (domainId) {
        const hit = await db.collection('settings').findOne({ key, domainId })
        if (hit) return settingValue(hit, key)
    }
    if (fallbackDomainId && fallbackDomainId !== domainId) {
        const hit = await db.collection('settings').findOne({ key, domainId: fallbackDomainId })
        if (hit) return settingValue(hit, key)
    }
    return null
}

// An encrypted value we cannot decrypt is worse than a missing one: the flow
// would compute a capture amount the server disagrees with and pack could fall
// through to a real Hyp charge. Refuse instead.
function settingValue(doc, key) {
    let value
    try {
        value = decryptDoc(doc).value
    } catch {
        throw new Error(`Setting "${key}" is encrypted and SECRET is unavailable to the stress runner — refusing to guess the capture amount.`)
    }
    if (isEncrypted(value))
        throw new Error(`Setting "${key}" could not be decrypted (wrong SECRET?) — refusing to guess the capture amount.`)
    return value
}

async function defaultDomainId(db) {
    const domain = await db.collection('domains').findOne({ isDefault: true, active: true }, { projection: { _id: 0, id: 1 } })
    return domain?.id || null
}

async function sampleProducts(db, domainId, limit = 400) {
    const docs = await db.collection('products').find(
        {
            active: true,
            status: 'active',
            barcode: { $type: 'string' },
            'prices.domainId': domainId
        },
        { projection: { _id: 0, id: 1, barcode: 1, name: 1, unit: 1 } }
    ).limit(limit).toArray()
    const seen = new Set()
    const products = []
    for (const doc of docs) {
        if (!doc.barcode || seen.has(doc.barcode)) continue
        seen.add(doc.barcode)
        products.push({ ...doc, weighted: doc.unit?.type === 'weight' })
    }
    return products
}

function sampledCityQueries() {
    return CITY_GROUPS.map(group => ({ group: group.label, query: { 'address.city': { $in: group.samples } } }))
}

async function addressCandidates(db) {
    const out = []
    for (const { group, query } of sampledCityQueries()) {
        const order = await db.collection('orders').findOne(
            {
                ...query,
                'address.street': { $type: 'string', $ne: '' },
                'address.building': { $exists: true, $ne: null }
            },
            { projection: { _id: 0, address: 1 }, sort: { time: -1 } }
        )
        if (order?.address) {
            out.push({
                label: group,
                source: 'sampled delivered address',
                city: order.address.city,
                street: order.address.street,
                building: String(order.address.building),
                apartment: order.address.apartment,
                floor: order.address.floor ?? '2',
                hasElevator: true
            })
        }
        const fallback = CITY_GROUPS.find(g => g.label === group).fallback
        out.push({ label: group, source: 'known street', floor: '2', hasElevator: true, ...fallback })
    }
    return out
}

function flattenWindows(groups) {
    const rows = []
    for (const group of groups || []) {
        for (const window of group.windows || []) rows.push({ date: group.date, ...window })
    }
    return rows
}

async function ensureWindow(db, { storeId, timezone }) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const date = isoDate(tomorrow)
    const start = 8
    const end = 14
    const startTimestamp = new Date(`${date}T${String(start).padStart(2, '0')}:00:00.000Z`)
    const endTimestamp = new Date(`${date}T${String(end).padStart(2, '0')}:00:00.000Z`)
    const doc = {
        id: uid(),
        storeId,
        date,
        dayOfWeek: new Date(`${date}T12:00:00.000Z`).getUTCDay(),
        start,
        end,
        maxCapacity: 100,
        manualCapacity: true,
        // Raw insertOne bypasses mongoose defaults, and order/window/options
        // filters on active:true — without this the created window is invisible.
        active: true,
        disabled: false,
        totalOrders: 0,
        areaGroups: [],
        leadHours: 0,
        timezone,
        startTimestamp,
        endTimestamp,
        // choose() rejects a window whose lead time already passed; one minute
        // of headroom is enough for the flow to reserve it.
        leadTimestamp: new Date(Date.now() + 60_000)
    }
    await db.collection('order_windows').insertOne(doc)
    return doc
}

async function findSuperAdmin(db) {
    const roles = await db.collection('roles').find(
        { permissions: 'admin:super' }, { projection: { _id: 0, id: 1 } }
    ).toArray()
    const roleIds = roles.map(role => role.id).filter(Boolean)
    if (!roleIds.length) return null
    return db.collection('admins').findOne(
        {
            roleId: { $in: roleIds },
            phone: { $type: 'string' },
            idNum: { $type: 'string' },
            active: { $ne: false }
        },
        { projection: { _id: 0, id: 1, idNum: 1, phone: 1, name: 1, roleId: 1 } }
    )
}

async function adminIsSuper(db, admin) {
    if (!admin?.roleId) return false
    const role = await db.collection('roles').findOne({ id: admin.roleId }, { projection: { _id: 0, permissions: 1 } })
    return Boolean(role?.permissions?.includes('admin:super'))
}

async function resolveFlowAdmin({ fixtures, opts, clients, newClient, log }) {
    const db = fixtures.db
    const superAdmin = await findSuperAdmin(db)
    const primaryId = opts.idNum ? String(opts.idNum) : null
    if (superAdmin && String(superAdmin.idNum) !== primaryId) {
        if (!opts.headlessOtp)
            throw new Error(
                'The order flow needs a super admin (delivery without a proof photo, store switch, pick/ship permissions). ' +
                'The sampled super admin is a different account — pass --headless-otp (or log in with its --id-num).'
            )
        const client = await newClient({ origin: opts.adminOrigin })
        await adminLogin(client, fixtures, {
            idNum: String(superAdmin.idNum),
            phone: superAdmin.phone,
            label: 'flow super admin',
            headlessOtp: true
        })
        log(`flow admin: super admin (idNum ${superAdmin.idNum})`)
        return { client, admin: superAdmin, isSuperAdmin: true }
    }

    const primary = primaryId
        ? await db.collection('admins').findOne(
            { $or: [{ idNum: primaryId }, { idNum: Number(primaryId) }] },
            { projection: { _id: 0, id: 1, idNum: 1, phone: 1, name: 1, roleId: 1 } }
        )
        : null
    const isSuperAdmin = await adminIsSuper(db, primary)
    log(`flow admin: ${isSuperAdmin ? 'super admin' : 'the stress admin (NOT super — pick/ship may be refused)'}`)
    return { client: clients.admin, admin: primary, isSuperAdmin }
}

function createRecorder(steps) {
    return async function call(client, step, route, payload = {}, { timeoutMs = 30_000, note = null } = {}) {
        const res = await client.call(route, payload, { timeoutMs, keepBody: true })
        steps.push({
            step,
            route,
            status: res.status,
            kind: res.kind,
            ok: res.ok,
            ms: res.ms,
            ...(note ? { note } : {}),
            ...(res.ok ? {} : { error: res.error })
        })
        if (!res.ok) throw new FlowError(step, `${route} → ${res.status} ${res.kind} ${res.error || ''}`.trim(), steps)
        return res.body?.data
    }
}

async function ensureShopper({ fixtures, client, opts, call, steps }) {
    const phone = opts.flowPhone
    const existing = await fixtures.db.collection('users').findOne({ phone }, { projection: { _id: 0, id: 1, domainId: 1 } })
    if (existing && fixtures.domainId && existing.domainId && existing.domainId !== fixtures.domainId)
        steps.push({
            step: 'shopper domain',
            route: null,
            ok: true,
            status: null,
            kind: 'note',
            ms: 0,
            note: `phone ${phone} belongs to domain ${existing.domainId}, not the default ${fixtures.domainId}; login may fail`
        })

    const otpToken = uid(16)
    const otp = uid(6, true)
    const doc = {
        phone,
        token: otpToken,
        otp,
        attempts: 0,
        remember: true,
        createdAt: new Date()
    }
    // user/login creates the user from storedOtp.payload — the same document
    // user/register would have written, minus the SMS. That is how a new
    // shopper is "registered" without sending a code to a real phone.
    if (!existing) {
        doc.payload = {
            phone,
            name: { first: 'Stress', last: 'Flow' },
            email: `stress-flow-${String(phone).replace(/\D/g, '')}@example.com`,
            getOffers: false,
            domainId: fixtures.domainId
        }
    }
    await fixtures.otpCollection.insertOne(doc)

    const data = await call(client, existing ? 'shopper login' : 'shopper register + login', 'user/login', { phone, otpToken, otp })
    return { userId: data?.user?.id || existing?.id || null, registered: !existing }
}

async function enterAddress({ db, client, call, steps }) {
    const candidates = await addressCandidates(db)
    for (const candidate of candidates) {
        const payload = {
            city: candidate.city,
            street: candidate.street,
            building: candidate.building,
            apartment: candidate.apartment || '1',
            floor: candidate.floor,
            hasElevator: candidate.hasElevator
        }
        let added
        try {
            added = await call(client, `address ${candidate.label}`, 'user/address/add', payload, {
                note: `${candidate.street} ${candidate.building}, ${candidate.city} (${candidate.source})`
            })
        } catch (err) {
            if (!(err instanceof FlowError)) throw err
            continue // try the next city
        }
        if (!added?.address?.hasService) continue

        try {
            await call(client, `address ${candidate.label} active`, 'user/address/active', { addressId: added.address.addressId })
        } catch (err) {
            if (!(err instanceof FlowError)) throw err
            continue // address service resolution disagreed with add — try the next city
        }
        return {
            city: candidate.city,
            street: candidate.street,
            building: candidate.building,
            label: candidate.label,
            addressId: added.address.addressId
        }
    }
    throw new FlowError(
        'address',
        `no address had a service area (tried ${candidates.map(c => `${c.street}, ${c.city}`).join(' | ')})`,
        steps
    )
}

// Older restores contain cart orders created before orders carried a domainId.
// The cart endpoints fall back to the router's domain, but replacement lines are
// built from order.domainId — a missing value makes the app reject the
// replacement ("product not available in this domain"). Repair the reused cart.
async function ensureCartDomain({ db, fixtures, orderId, steps }) {
    if (!orderId || !fixtures.domainId) return
    const order = await db.collection('orders').findOne(
        { id: orderId },
        { projection: { _id: 0, domainId: 1 } }
    )
    if (!order || order.domainId) return
    await db.collection('orders').updateOne({ id: orderId }, { $set: { domainId: fixtures.domainId } })
    steps.push({
        step: 'cart domain repaired',
        route: null,
        ok: true,
        status: null,
        kind: 'fixture',
        ms: 0,
        note: `domainId → ${fixtures.domainId}`
    })
}

async function addProducts({ client, call, db, fixtures, steps, log }) {
    if (!fixtures.domainId)
        throw new FlowError('cart', 'no active domain was sampled from the stress DB', steps)
    const products = await sampleProducts(db, fixtures.domainId)
    if (products.length < 10)
        throw new FlowError('cart', `only ${products.length} active products priced for domain ${fixtures.domainId} — need at least 10`, steps)

    const weighted = products.filter(p => p.weighted)
    const units = products.filter(p => !p.weighted)
    if (!weighted.length)
        log('flow warning: no weight-based product priced for this domain — weighted picking is skipped')
    else if (!units.length)
        log('flow warning: no unit product priced for this domain — scanning is skipped')

    const chosen = [...weighted.slice(0, 4), ...units.slice(0, 12)]
    for (const product of products) {
        if (chosen.length >= 10) break
        if (!chosen.includes(product)) chosen.push(product)
    }
    const limits = await settingValueFor(db, 'limits', fixtures.domainId, await defaultDomainId(db))
    const minSum = Number(limits?.minSum ?? 0) || 0
    // order/cart/product rejects an amount above limits.productMaxAmount.
    const maxAmount = Number(limits?.productMaxAmount ?? 0) || 0
    const cap = maxAmount > 0 ? maxAmount : Infinity

    let order = null
    let amountIndex = 0
    const add = async product => {
        const base = product.weighted ? WEIGHTED_AMOUNT : 1 + (amountIndex++ % 3)
        const amount = Math.max(0.001, Math.min(base, cap))
        const data = await call(client, 'cart add', 'order/cart/product', { id: product.id, amount }, {
            note: `${product.name || product.barcode} × ${amount}${product.weighted ? ' kg' : ''}`
        })
        order = data?.order || order
    }

    for (const product of chosen) await add(product)

    // At least 10 lines is the point, but the domain's minSum is what payment
    // would enforce; keep adding until the cart clears it.
    const remaining = products.filter(p => !chosen.includes(p))
    let index = 0
    while (minSum > 0 && Number(order?.sum ?? 0) < minSum && index < remaining.length && order?.cart?.length < 30) {
        const product = remaining[index++]
        await add(product)
    }
    if (minSum > 0 && Number(order?.sum ?? 0) < minSum)
        throw new FlowError('cart', `cart sum ${order?.sum ?? 0} is below the domain minSum ${minSum} and the product pool ran out`, steps)

    return { order, productCount: order?.cart?.length || chosen.length, minSum, weightedProducts: weighted.length }
}

async function chooseWindow({ db, client, call, orderId, steps, log }) {
    const storeId = (await db.collection('orders').findOne({ id: orderId }, { projection: { _id: 0, storeId: 1 } }))?.storeId
    if (!storeId) throw new FlowError('window', 'the cart order has no storeId (address did not resolve to a supply area)', steps)

    const timezone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jerusalem'
    let groups = await call(client, 'window options', 'order/window/options', {})
    let windows = flattenWindows(groups).filter(w => w.disabled !== true && w.note !== 'past')
    if (!windows.length) {
        log(`flow: no open window for store ${storeId} — creating one for tomorrow`)
        const created = await ensureWindow(db, { storeId, timezone })
        steps.push({ step: 'window create', route: null, ok: true, status: null, kind: 'fixture', ms: 0, note: `${created.date} ${created.start}:00–${created.end}:00` })
        groups = await call(client, 'window options (after create)', 'order/window/options', {})
        windows = flattenWindows(groups).filter(w => w.disabled !== true && w.note !== 'past')
    }
    const window = windows[0]
    if (!window?.id) throw new FlowError('window', 'no available delivery window after creating one', steps)

    await call(client, 'window choose', 'order/window/choose', { windowId: window.id }, {
        note: `${window.date} ${String(window.start).padStart(2, '0')}:00–${String(window.end).padStart(2, '0')}:00`
    })
    return { id: window.id, date: window.date, start: window.start, end: window.end }
}

// The callback's database effect, without the Hyp round-trip: status paid and
// the authorization fields pack/capture later reads.
async function simulateAuthorization({ db, fixtures, orderId, steps }) {
    const order = await db.collection('orders').findOne({ id: orderId })
    if (!order) throw new FlowError('payment', `order ${orderId} not found`, steps)
    const authorizedAmount = Number(order.finalSumWithShipping ?? order.finalSum ?? order.sum ?? 0)
    if (!(authorizedAmount > 0)) throw new FlowError('payment', `order ${orderId} has no positive total`, steps)

    const providerTxnId = `stress-auth-${order.id}`
    const payment = {
        provider: 'hyp',
        providerTxnId,
        authCode: 'STRESS',
        providerUid: providerTxnId,
        providerPayerId: '000000000',
        cardToken: `stress-token-${order.id}`,
        cardExpiry: '3012',
        last4digits: '0000',
        cardCompany: 'Visa',
        payments: 1,
        authorizedAmount
    }
    await db.collection('orders').updateOne(
        { id: order.id },
        { $set: { status: 'paid', payment, paidAt: new Date(), paymentError: null } }
    )
    await db.collection('payment_transactions').insertOne({
        id: uid(),
        domainId: order.domainId,
        storeId: order.storeId,
        orderId: order.id,
        orderNumber: order.number,
        userId: order.userId,
        provider: 'hyp',
        kind: 'auth',
        status: 'success',
        amount: authorizedAmount,
        providerTxnId,
        authCode: 'STRESS',
        providerData: { simulatedBy: 'scripts/stress/flow' },
        createdAt: new Date()
    })
    steps.push({ step: 'payment authorized (simulated callback)', route: null, ok: true, status: null, kind: 'simulated', ms: 0, note: `₪${authorizedAmount}` })
    return { providerTxnId, authorizedAmount }
}

async function pickOrder({ db, client, call, fixtures, orderId, steps, log }) {
    const order = await db.collection('orders').findOne({ id: orderId })
    if (!order) throw new FlowError('picking', `order ${orderId} not found`, steps)
    if (!order.cart?.length) throw new FlowError('picking', 'order cart is empty', steps)

    await call(client, 'ops claim', 'order/ops/claim', { id: orderId })

    const pickLimitsValue = await settingValueFor(db, 'pickLimits', order.domainId || fixtures.domainId, null)
    const pickLimits = normalizePickLimits(pickLimitsValue || DEFAULT_PICK_LIMITS)

    const cartBarcodes = new Set(order.cart.map(line => line.barcode))
    const pool = await sampleProducts(db, order.domainId || fixtures.domainId)
    const usedReplacements = new Set()

    const pickReplacement = weighted => {
        return pool.find(product =>
            !cartBarcodes.has(product.barcode) &&
            !usedReplacements.has(product.barcode) &&
            product.weighted === weighted
        ) || pool.find(product => !cartBarcodes.has(product.barcode) && !usedReplacements.has(product.barcode))
    }

    const lines = order.cart
    // Handle the stock-out/replacement on unit lines first, so the weighted
    // lines stay free for the 'weight' action — that is the deviation path the
    // flow is meant to exercise (ordered amount + 0.001–0.099 kg).
    const ordered = [...lines.filter(line => line.unit?.type !== 'weight'), ...lines.filter(line => line.unit?.type === 'weight')]
    const missingLine = ordered[0]
    const replaceLines = ordered.slice(1, Math.min(3, ordered.length))
    const handled = new Set([missingLine?.barcode, ...replaceLines.map(line => line.barcode)])

    if (missingLine)
        await call(client, 'pick missing', 'order/ops/pick_item', {
            id: orderId,
            barcode: missingLine.barcode,
            action: 'missing',
            missingReason: MISSING_REASON
        }, { note: missingLine.name || missingLine.barcode })

    const replaced = []
    for (const line of replaceLines) {
        const product = pickReplacement(line.unit?.type === 'weight')
        if (!product) {
            log('flow warning: no replacement product left in the pool — line scanned instead')
            handled.delete(line.barcode)
            continue
        }
        usedReplacements.add(product.barcode)
        await call(client, 'pick replace', 'order/ops/pick_item', {
            id: orderId,
            barcode: line.barcode,
            action: 'replace',
            replacement: { replacementBarcode: product.barcode, amount: line.amount }
        }, { note: `${line.name || line.barcode} → ${product.name || product.barcode}` })
        replaced.push({ from: line.barcode, to: product.barcode })
    }

    const weightedPicks = []
    for (const line of lines) {
        if (!line.barcode || handled.has(line.barcode)) continue
        const isWeighted = line.unit?.type === 'weight'
        if (isWeighted) {
            // Ordered amount + 0.001–0.099 kg, clamped to the domain's upward
            // pick tolerance so a stricter-than-default setting still passes.
            const maxBump = Number(line.amount) * (pickLimits.weightUpPct / 100) * 0.9
            const bump = Math.max(0.001, Math.min(0.001 + Math.random() * 0.098, maxBump))
            const finalAmount = round3(Number(line.amount) + bump)
            await call(client, 'pick weight', 'order/ops/pick_item', {
                id: orderId,
                barcode: line.barcode,
                action: 'weight',
                finalAmount
            }, { note: `${line.name || line.barcode}: ${line.amount} → ${finalAmount} kg` })
            weightedPicks.push({ barcode: line.barcode, ordered: line.amount, picked: finalAmount })
        } else {
            await call(client, 'pick scan', 'order/ops/pick_item', {
                id: orderId,
                barcode: line.barcode,
                action: 'scan',
                finalAmount: line.amount
            }, { note: `${line.name || line.barcode} × ${line.amount}` })
        }
    }

    await call(client, 'pick complete', 'order/ops/pick_complete', { id: orderId })
    return {
        missing: missingLine?.barcode || null,
        replaced,
        weightedPicks
    }
}

// Same lookup as server/utils/data/getShippingConfig.js: this domain's setting,
// else the default domain's. Do not guess: a config the server would not use
// changes the capture amount and would send pack into a real Hyp charge.
async function shippingConfigFor(db, domainId) {
    if (!domainId) return null
    const own = await settingValueFor(db, 'shipping', domainId, null)
    if (own) return own
    const fallbackId = await defaultDomainId(db)
    if (fallbackId && fallbackId !== domainId)
        return settingValueFor(db, 'shipping', fallbackId, null)
    return null
}

// What captureOrder would charge, computed from the same fields it reads.
async function captureAmountFor(db, order) {
    const sumBase = Number(order.sum ?? order.finalSum ?? 0)
    const finalBase = Number(order.finalSum ?? sumBase)
    const shippingConfig = await shippingConfigFor(db, order.domainId)
    const shipping = calcShipping({ sum: sumBase, deliveryMethod: order.deliveryMethod, shippingConfig })
    return round2(finalBase + shipping)
}

// Pack's capture runs after picking (totals changed). Record the CAPTURE the
// provider would have returned and mark the order captured, so captureOrder's
// delta path finds nothing left to charge and stays entirely offline.
//
// The row carries one agora more than the computed total on purpose: the delta
// path only charges when captureAmount - capturedTotal > EPS (0.005), so a cent
// of headroom turns any tiny mismatch between this module's reproduction and
// the server's into a no-op instead of a real Hyp charge.
const CAPTURE_SAFETY_PAD = 0.01
async function simulateCapture({ db, fixtures, orderId, steps }) {
    const order = await db.collection('orders').findOne({ id: orderId })
    if (!order) throw new FlowError('capture', `order ${orderId} not found`, steps)
    const amount = await captureAmountFor(db, order)
    if (!(amount > 0)) throw new FlowError('capture', `order ${orderId} has no positive capture amount`, steps)
    const recorded = round2(amount + CAPTURE_SAFETY_PAD)

    const providerTxnId = `stress-cap-${order.id}`
    await db.collection('payment_transactions').insertOne({
        id: uid(),
        domainId: order.domainId,
        storeId: order.storeId,
        orderId: order.id,
        orderNumber: order.number,
        userId: order.userId,
        provider: 'hyp',
        kind: 'capture',
        status: 'success',
        amount: recorded,
        providerTxnId,
        providerData: { simulatedBy: 'scripts/stress/flow' },
        createdAt: new Date()
    })
    await db.collection('orders').updateOne(
        { id: order.id },
        {
            $set: {
                paid: true,
                paidAt: new Date(),
                'payment.captureProviderTxnId': providerTxnId,
                'payment.capturedAt': new Date()
            }
        }
    )
    steps.push({ step: 'payment captured (simulated)', route: null, ok: true, status: null, kind: 'simulated', ms: 0, note: `₪${amount}` })
    return { providerTxnId, amount }
}

async function shipAndDeliver({ db, client, call, orderId, isSuperAdmin, steps }) {
    await call(client, 'pack', 'order/ops/pack', { id: orderId, bags: 2, boxes: 1 })
    await call(client, 'shipment start', 'shipment/start', { orderIds: [orderId] })
    await call(client, 'shipment deliver', 'shipment/deliver', {
        orderId,
        ...(isSuperAdmin ? {} : { imageBase64: TINY_PNG })
    })

    const final = await db.collection('orders').findOne({ id: orderId }, { projection: { _id: 0, status: 1 } })
    if (final?.status !== 'done')
        throw new FlowError('delivery', `order ${orderId} ended in status "${final?.status}" (expected done)`, steps)
    return final.status
}

export async function runOrderFlow({ fixtures, opts, clients, newClient, log = () => {} }) {
    const steps = []
    const call = createRecorder(steps)
    const db = fixtures.db
    const result = {
        ok: false,
        startedAt: new Date().toISOString(),
        phone: opts.flowPhone,
        steps,
        orderId: null,
        orderNumber: null
    }

    const shopper = await newClient({ origin: opts.storefrontOrigin, platform: CUSTOMER_PLATFORM })
    const flowAdmin = await resolveFlowAdmin({ fixtures, opts, clients, newClient, log })

    try {
        const shopperInfo = await ensureShopper({ fixtures, client: shopper, opts, call, steps })
        result.userId = shopperInfo.userId
        result.registered = shopperInfo.registered
        log(`flow shopper ${shopperInfo.registered ? 'registered' : 'logged in'} (${opts.flowPhone})`)

        // Force delivery: the flow needs an address + window, not a pickup.
        await call(shopper, 'delivery method', 'user/delivery_method', {})

        result.address = await enterAddress({ db, client: shopper, call, steps })
        log(`flow address: ${result.address.street} ${result.address.building}, ${result.address.city}`)

        const cleared = await call(shopper, 'cart clear', 'order/cart/clear', {})
        await ensureCartDomain({ db, fixtures, orderId: cleared?.order?.id, steps })
        const cartInfo = await addProducts({ client: shopper, call, db, fixtures, steps, log })
        const cart = cartInfo.order
        if (!cart?.id) throw new FlowError('cart', 'cart get returned no order id', steps)
        result.orderId = cart.id
        result.orderNumber = cart.number
        result.products = cartInfo.productCount
        result.minSum = cartInfo.minSum
        log(`flow cart: ${cartInfo.productCount} lines, sum ${cart.sum}`)
        if (Number(cart.sum ?? 0) <= 0) throw new FlowError('cart', 'cart total is not positive', steps)

        result.window = await chooseWindow({ db, client: shopper, call, orderId: cart.id, steps, log })
        log(`flow window: ${result.window.date} ${result.window.start}:00–${result.window.end}:00`)

        await simulateAuthorization({ db, fixtures, orderId: cart.id, steps })

        const storeId = (await db.collection('orders').findOne({ id: cart.id }, { projection: { _id: 0, storeId: 1 } }))?.storeId
        await call(flowAdmin.client, 'ops current store', 'admin/current_store', { storeId })

        result.picking = await pickOrder({
            db, client: flowAdmin.client, call, fixtures, orderId: cart.id, steps, log
        })
        log(`flow picking: 1 missing, ${result.picking.replaced.length} replaced, ${result.picking.weightedPicks.length} weighted`)

        await simulateCapture({ db, fixtures, orderId: cart.id, steps })
        result.finalStatus = await shipAndDeliver({
            db,
            client: flowAdmin.client,
            call,
            orderId: cart.id,
            isSuperAdmin: flowAdmin.isSuperAdmin,
            steps
        })
        result.ok = true
        result.durationMs = Date.now() - new Date(result.startedAt).getTime()
        log(`flow order ${result.orderNumber || result.orderId}: ${result.finalStatus}`)
        return result
    } catch (err) {
        result.error = err.message
        result.durationMs = Date.now() - new Date(result.startedAt).getTime()
        if (err instanceof FlowError) err.flow = result
        throw err
    }
}

// One compact line per step, then the order summary. Kept here (not in
// report.js) so the flow stays self-contained; run.js prints it right after the
// sweep and release.js prints it before the proceed prompt.
export function flowSummary(result) {
    if (!result) return { ok: false, steps: 0, failedStep: null, error: 'flow did not run' }
    const failed = result.steps.find(step => !step.ok)
    return {
        ok: Boolean(result.ok),
        steps: result.steps.length,
        durationMs: result.durationMs ?? null,
        orderId: result.orderId ?? null,
        orderNumber: result.orderNumber ?? null,
        products: result.products ?? null,
        finalStatus: result.finalStatus ?? null,
        missing: result.picking?.missing ?? null,
        replaced: result.picking?.replaced?.length ?? 0,
        weightedPicks: result.picking?.weightedPicks?.length ?? 0,
        failedStep: failed?.step ?? null,
        error: result.error ?? null
    }
}

export function printFlowReport(result) {
    const summary = flowSummary(result)
    console.log('\n── order flow (write simulation, local DB only) ──────────────')
    console.log(`${summary.ok ? '✔' : '✖'} ${summary.ok ? 'done' : (summary.failedStep || 'failed')}`
        + `  steps ${summary.steps}`
        + (summary.durationMs != null ? `  ${(summary.durationMs / 1000).toFixed(1)}s` : '')
        + (summary.orderNumber ? `  order ${summary.orderNumber}` : ''))
    if (result?.steps?.length) {
        for (const step of result.steps) {
            const mark = step.ok ? '✔' : '✖'
            const route = step.route ? ` ${step.route}` : ''
            const ms = step.ms ? ` ${step.ms}ms` : ''
            console.log(`  ${mark} ${String(step.step).padEnd(38)}${route.padEnd(28)}${ms.padEnd(8)}${step.note || ''}`)
        }
    }
    if (summary.ok)
        console.log(`  products ${summary.products}  missing 1  replaced ${summary.replaced}  weighted ${summary.weightedPicks}  → ${summary.finalStatus}`)
    else if (summary.error)
        console.log(`  error: ${summary.error}`)
}
