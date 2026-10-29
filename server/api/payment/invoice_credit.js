import { issueCreditNote } from '#server/utils/data/invoice.js'

/**
 * POST /api/payment/invoice_credit
 *
 * Issue a credit note for money refunded outside the normal refund flow.
 * Line attribution is required: an amount without item rows would need one
 * VAT class for the whole credit, which is wrong for a mixed basket. The
 * automated refund/cancel paths do this themselves; this endpoint is for
 * manual/retry cases.
 */
export default async function invoice_credit(payload, info) {
    const { DL, external, utils, _admin } = info
    const { orderId, refundTxnId, amount, items, reason } = payload || {}
    if (!orderId) throw { status: 400, message: 'orderId required' }

    const order = await DL.Order.readById(orderId)
    if (!order) throw { status: 404, message: 'Order not found' }
    if (!order.paid) throw { status: 400, message: 'Order not captured yet' }

    let creditItems = Array.isArray(items) ? items : []
    let creditAmount = Number(amount) || 0

    // A refund transaction already carries the attributed rows (first leg).
    if (!creditItems.length && refundTxnId) {
        const txn = await DL.PaymentTransaction
            .readOne({ orderId: order.id, providerTxnId: String(refundTxnId) }, { _id: 0 })
            .catch(() => null)
        if (!txn) throw { status: 404, message: 'Refund transaction not found' }
        if (txn.kind !== DL.PaymentTransaction.constants.TRANSACTION_KIND.REFUND)
            throw { status: 400, message: 'Transaction is not a refund' }
        creditItems = Array.isArray(txn.items) ? txn.items : []
        if (!(creditAmount > 0)) creditAmount = Number(txn.amount) || 0
    }

    if (!creditItems.length)
        throw { status: 400, message: 'items required — a credit note needs line attribution' }
    if (!(creditAmount > 0)) {
        creditAmount = creditItems.reduce((acc, item) => acc + (Number(item.amount ?? item.gross) || 0), 0)
    }

    const record = await issueCreditNote({
        DL, external, utils, order,
        refundItems: creditItems.map(item => ({
            productId: item.productId,
            barcode: item.barcode,
            name: item.name,
            amount: Number(item.amount ?? item.gross) || 0
        })),
        amount: creditAmount,
        refundTxnId: refundTxnId ? String(refundTxnId) : undefined,
        reason: reason || '',
        force: true,
        source: 'payment/invoice_credit',
        actor: utils.data.timeline.adminActor(_admin)
    })

    if (record?.skipped)
        throw { status: 400, message: `Credit note not issued: ${record.skipped}` }
    if (record?.shadow)
        throw { status: 400, message: 'EZcount is in shadow mode — no document was created', invoiceId: record?.id }
    if (record?.status !== 'issued')
        throw { status: 502, message: record?.error || 'Credit note issuance failed', invoiceId: record?.id }

    return {
        issued: true,
        creditId: record.id,
        number: record.docNumber,
        url: record.docUrl,
        status: record.status
    }
}

invoice_credit.config = {
    permissions: ['invoice:credit', 'order:payment'],
    preventMultiple: (body) => ':' + (body?.orderId || '')
}
