import diff from '#common/functions/diff.js'

export default async function update(payload, { DL, _admin }) {
    const { id } = payload

    const coupon = await DL.Coupon.readById(id)
    if (!coupon) throw { status: 400, message: 'coupon does not exist' }

    const update = diff(coupon, payload)
    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate) return coupon

    const updated = await DL.Coupon.updateOne({ id }, update)
    return updated
}

update.config = {
    required: ['id'],
    permissions: ['coupon:update']
}
