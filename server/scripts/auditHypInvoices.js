/**
 * Read-only audit of legacy Hyp invoices (PrintHesh links).
 *
 * Lists documents attached to orders that were never charged, or that were
 * canceled, so finance can void/credit them manually. The EZcount flow no
 * longer issues documents through Hyp.
 *
 * Usage: node server/scripts/runAuditHypInvoices.js [--json]
 */
import log from '#server/utils/log.js'

export default async function auditHypInvoices({ DL } = {}, { json = false, limit = 500 } = {}) {
    if (!DL?.Order) throw new Error('DL required')

    const select = {
        _id: 0, id: 1, number: 1, status: 1, paid: 1, time: 1,
        'payment.captureProviderTxnId': 1, 'invoice.number': 1, 'invoice.url': 1,
        'invoice.issuedAt': 1
    }
    const withInvoice = await DL.Order.read(
        { 'invoice.url': { $exists: true, $ne: null } },
        select,
        { limit: 0 }
    ).catch(() => [])

    const suspicious = []
    for (const order of withInvoice || []) {
        const canceled = order.status === DL.Order.constants.ORDER_STATUS.CANCELED
        const notCharged = !order.paid || !order.payment?.captureProviderTxnId
        if (canceled || notCharged) {
            suspicious.push({
                orderId: order.id,
                orderNumber: order.number,
                status: order.status,
                paid: Boolean(order.paid),
                charged: Boolean(order.payment?.captureProviderTxnId),
                invoiceNumber: order.invoice?.number,
                invoiceUrl: order.invoice?.url,
                time: order.time
            })
        }
    }

    if (json) return suspicious

    log.info(`[auditHypInvoices] orders with a legacy invoice link: ${(withInvoice || []).length}`)
    if (!suspicious.length) {
        log.success('[auditHypInvoices] no uncharged/canceled order carries a document')
        return suspicious
    }
    log.warn(`[auditHypInvoices] review ${suspicious.length} order(s):`)
    for (const row of suspicious.slice(0, limit)) {
        console.log(`  ${row.orderNumber}  ${row.status}  paid=${row.paid}  charged=${row.charged}  doc=${row.invoiceNumber || '-'}`)
    }
    if (suspicious.length > limit) console.log(`  ... ${suspicious.length - limit} more`)
    return suspicious
}
