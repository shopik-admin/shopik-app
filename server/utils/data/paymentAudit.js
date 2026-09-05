// Shared builder for DL.PaymentTransaction.create payloads used by the hyp payment endpoints.
// Fills the order-derived and provider fields that every call site repeats,
// so transaction records can't drift apart. Extra provider-specific fields are passed through.
export default function paymentTxn(order, { kind, status, amount, ...extra }) {
    return {
        domainId: order.domainId,
        storeId: order.storeId,
        orderId: order.id,
        orderNumber: order.number,
        userId: order.userId,
        provider: 'hyp',
        kind,
        status,
        amount,
        ...extra
    }
}
