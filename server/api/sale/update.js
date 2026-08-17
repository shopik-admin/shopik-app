import diff from '#common/functions/diff.js'

export default async function update(payload, { DL, _admin }) {
    const { id } = payload

    const sale = await DL.Sale.readById(id)
    if (!sale) throw { status: 400, message: 'sale does not exist' }

    const update = diff(sale, payload)
    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate) return sale

    const updated = await DL.Sale.updateOne({ id }, update)
    return updated
}

update.config = {
    required: ['id'],
    permissions: ['sale:update']
}
