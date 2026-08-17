export default async function create(payload, { DL, _admin }) {
    payload.adminId = _admin.id
    const created = await DL.Coupon.create(payload)
    return created
}

create.config = {
    permissions: ['coupon:create']
}
