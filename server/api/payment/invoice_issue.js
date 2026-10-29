import { issueInvoice } from '#server/utils/data/invoice.js'

/**
 * POST /api/payment/invoice_issue
 * Admin retry / manual issuance for a captured order.
 *
 * The capture endpoint already issues the document; this exists for a failed
 * or shadow-mode issuance once the configuration is fixed.
 */
export default async function invoice_issue(payload, info) {
    const { DL, external, utils, _admin } = info
    const orderId = payload?.orderId
    if (!orderId) throw { status: 400, message: 'orderId required' }

    const order = await DL.Order.readById(orderId)
    if (!order) throw { status: 404, message: 'Order not found' }
    if (!order.paid || !order.payment?.captureProviderTxnId)
        throw { status: 400, message: 'Order not captured yet' }

    const captured = Number(order.finalSumWithShipping ?? order.finalSum ?? 0)
    const record = await issueInvoice({
        DL, external, utils, order,
        captured,
        force: true,
        source: 'payment/invoice_issue',
        actor: utils.data.timeline.adminActor(_admin)
    })

    if (record?.skipped)
        throw { status: 400, message: `Invoice not issued: ${record.skipped}` }
    if (record?.shadow)
        throw { status: 400, message: 'EZcount is in shadow mode — no document was created', invoiceId: record?.id }
    if (record?.status !== 'issued')
        throw { status: 502, message: record?.error || 'Invoice issuance failed', invoiceId: record?.id }

    return {
        issued: true,
        invoiceId: record.id,
        number: record.docNumber,
        url: record.docUrl,
        status: record.status
    }
}

invoice_issue.config = {
    // OR semantics: an accountant with only invoice:issue can retry, and the
    // payment role keeps its existing capability.
    permissions: ['invoice:issue', 'order:payment'],
    preventMultiple: (body) => ':' + (body?.orderId || '')
}
