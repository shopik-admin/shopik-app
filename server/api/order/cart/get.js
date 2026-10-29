import filterClientOrder from '#server/utils/data/filterClientOrder.js'

// Authoritative snapshot of the customer's open cart order. The storefront
// reconciles with this on checkout and before starting a payment, so the total
// shown is the one `payment/create` will charge.
export default async function get(payload, { DL, _user, utils }) {
    const order = await utils.data.getUserOrder({ DL, _user })
    return { order: filterClientOrder(order) }
}

get.config = { auth: 'required' }
