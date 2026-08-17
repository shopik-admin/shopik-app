import diff from '#common/functions/diff.js'

export default async function update(payload, { DL, _admin }) {
    const { id } = payload

    const product = await DL.Product.readById(id)
    if (!product) throw { status: 400, message: 'product does not exist' }

    const update = diff(product, payload)
    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate) return product

    const updated = await DL.Product.updateOne({ id }, update)
    return updated
}

update.config = {
    required: ['id'],
    permissions: ['product:update']
}