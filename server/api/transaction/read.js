export default async function read(payload, { DL }) {
    const { filter = {}, select, sort, limit, skip, search } = payload
    // legacy alias for payment_transaction
    return DL.PaymentTransaction.read(filter, select, { sort, limit, skip, search })
}

read.config = {
    permissions: ['transaction:read']
}
