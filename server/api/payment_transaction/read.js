export default async function read(payload, { DL }) {
    const { filter = {}, select, sort, limit, skip, search } = payload
    return DL.PaymentTransaction.read(filter, select, { sort, limit, skip, search })
}

read.config = {
    permissions: ['payment_transaction:read']
}
