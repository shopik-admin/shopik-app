import { round2 } from '#common/functions/calcOrder/utils.js'
import { attachInvoiceUrl } from './orderInvoice.js'

const EPS = 0.001

// A needsSplit capture produces 2+ SUCCESS CAPTURE txns (J4 leg + token-charge
// overflow leg), but the order only keeps the LAST captureProviderTxnId.
// Refunding the full amount against that single leg fails with CCode 33
// ("Refund exceeds original amount"). So every refund must be distributed
// across the actual capture legs, reconstructed here from the ledger.

// Every SUCCESS CAPTURE txn is one capture leg. Deduped by providerTxnId
// (same Id recorded twice is the same money, not two legs).
export async function getCaptureLegs(DL, order) {
    const KIND = DL.PaymentTransaction.constants.TRANSACTION_KIND
    const STATUS = DL.PaymentTransaction.constants.TRANSACTION_STATUS
    let txns = []
    try {
        txns = await DL.PaymentTransaction.read({
            orderId: order.id,
            kind: KIND.CAPTURE,
            status: STATUS.SUCCESS
        }) || []
    } catch { txns = [] }
    const seen = new Map()
    for (const t of (txns || [])) {
        if (!t?.providerTxnId) continue
        const id = String(t.providerTxnId)
        const amount = Number(t.amount || 0)
        if (!(amount > 0) || seen.has(id)) continue
        seen.set(id, { providerTxnId: id, amount, createdAt: t.createdAt })
    }
    if (seen.size > 0) return Array.from(seen.values())
    // Legacy fallback: no capture txns on record — assume the single id on
    // the order covers the full amount (today's behavior).
    if (order.payment?.captureProviderTxnId) {
        return [{ providerTxnId: String(order.payment.captureProviderTxnId), amount: 0, unknownTotal: true }]
    }
    return []
}

// How much of one leg was already credited (each zikoy records its parent).
export async function getLegCreditedTotal(DL, orderId, legTxnId) {
    const KIND = DL.PaymentTransaction.constants.TRANSACTION_KIND
    const STATUS = DL.PaymentTransaction.constants.TRANSACTION_STATUS
    let txns = []
    try {
        txns = await DL.PaymentTransaction.read({
            orderId,
            kind: KIND.REFUND,
            status: STATUS.SUCCESS,
            parentProviderTxnId: String(legTxnId)
        }) || []
    } catch { txns = [] }
    return round2((txns || []).reduce((acc, t) => acc + Number(t.amount || 0), 0))
}

// Distribute totalRefund across legs with remaining credit, largest-first
// (fewer Hyp calls). Returns { plan, legsTotal }; plan is null when the legs
// can't cover the amount (e.g. a credit was issued manually via Hyp Console).
export async function planRefundLegs(DL, order, totalRefund) {
    const legs = await getCaptureLegs(DL, order)
    if (legs.length === 0) return { plan: null, legsTotal: 0 }
    if (legs.length === 1 && legs[0].unknownTotal) {
        return { plan: [{ providerTxnId: legs[0].providerTxnId, amount: round2(totalRefund) }], legsTotal: round2(totalRefund) }
    }
    const withRemaining = []
    for (const leg of legs) {
        const credited = await getLegCreditedTotal(DL, order.id, leg.providerTxnId)
        const remaining = round2(leg.amount - credited)
        if (remaining > 0) withRemaining.push({ providerTxnId: leg.providerTxnId, remaining })
    }
    const legsTotal = round2(withRemaining.reduce((acc, l) => acc + l.remaining, 0))
    withRemaining.sort((a, b) => b.remaining - a.remaining)
    let need = round2(Number(totalRefund || 0))
    const plan = []
    for (const leg of withRemaining) {
        if (need <= EPS) break
        const take = Math.min(leg.remaining, need)
        plan.push({ providerTxnId: leg.providerTxnId, amount: round2(take) })
        need = round2(need - take)
    }
    if (need > EPS) return { plan: null, legsTotal }
    return { plan, legsTotal }
}

// Run the plan leg by leg (sequential — Hyp credits are per-transaction).
// Writes one SUCCESS/FAILED PaymentTransaction per leg as it goes and stops
// at the first failure. Returns { completed, failed }.
export async function executeRefundPlan({ DL, external, order, plan, reason, items, source }) {
    const KIND = DL.PaymentTransaction.constants.TRANSACTION_KIND
    const STATUS = DL.PaymentTransaction.constants.TRANSACTION_STATUS
    const base = {
        domainId: order.domainId, storeId: order.storeId,
        orderId: order.id, orderNumber: order.number, userId: order.userId,
        provider: 'hyp'
    }
    const multi = plan.length > 1
    const completed = []
    let failed = null
    for (let i = 0; i < plan.length; i++) {
        const leg = plan[i]
        let hypRes
        try {
            hypRes = await external.hyp.refund({ providerTxnId: leg.providerTxnId, amount: leg.amount })
        } catch (e) {
            hypRes = { CCode: e?.providerCode ?? -1, error: e?.message || 'Refund failed' }
        }
        if (Number(hypRes.CCode) !== 0) {
            const msg = hypRes.error || external.hyp.ccodeMessage(hypRes.CCode)
            await DL.PaymentTransaction.create({
                ...base, kind: KIND.REFUND, status: STATUS.FAILED,
                amount: leg.amount, parentProviderTxnId: leg.providerTxnId,
                providerCode: hypRes.CCode, providerData: hypRes, error: msg, reason,
                ...(multi ? {} : { items })
            }).catch(() => { })
            failed = { providerTxnId: leg.providerTxnId, amount: leg.amount, hypRes, message: msg }
            break
        }
        const newId = hypRes.Id ? String(hypRes.Id) : undefined
        await DL.PaymentTransaction.create({
            ...base, kind: KIND.REFUND, status: STATUS.SUCCESS,
            amount: leg.amount, providerTxnId: newId, parentProviderTxnId: leg.providerTxnId,
            providerCode: 0,
            providerData: multi ? { ...hypRes, splitRefund: { legIndex: i, legCount: plan.length } } : hypRes,
            reason,
            ...((!multi || i === 0) ? { items } : {})
        })
        // Eager single-issuance invoice doc for this credit. Best-effort.
        await attachInvoiceUrl({ DL, external, providerTxnId: newId }).catch(() => { })
        completed.push({ providerTxnId: newId, parentProviderTxnId: leg.providerTxnId, amount: leg.amount, hypRes })
    }
    return { completed, failed }
}

// Attribute a (possibly partial) covered total back onto line items in order,
// so per-line refundedAmount stays consistent with refundedTotal on retry.
export function distributeCoveredAmount(items, total) {
    let left = round2(Number(total || 0))
    return (items || []).map((ri, idx, arr) => {
        if (idx === arr.length - 1) return { ...ri, amount: Math.max(0, left) }
        const take = Math.min(Number(ri.amount || 0), left)
        left = round2(left - take)
        return { ...ri, amount: take }
    })
}
