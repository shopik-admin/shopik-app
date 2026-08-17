export default async function read(payload, { DL, _admin }) {
    const { filter = {}, select } = payload
    const docs = await DL.Coupon.read(filter, select, payload)
    return DL.populate(
        docs,
        'adminId',
        {
            name: {
                key: 'adminName',
                format: (name) => `${name.first} ${name.last}`
            }
        }
    )
}

read.config = {
    permissions: ['coupon:read']
}
