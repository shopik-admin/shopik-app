export default async function id(payload, { DL, _admin }) {
    const { id } = payload
    return DL.Coupon.readById(id)
}

id.config = {
    permissions: ['coupon:id']
}
