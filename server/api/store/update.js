import diff from '#common/functions/diff.js'

export default async function update(payload, { DL, _admin, external, utils }) {
    const { id } = payload
    const store = await DL.Store.readById(id)
    if (!store) throw { status: 400, message: 'store does not exist' }

    const address = utils.extractFields.getAddress(payload)
    if (address)
        payload.address = address

    const update = diff(store, payload)
    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate) return store
    if (update.address)
        update.address = await external.geocode.address(update.address)

    const updated = await DL.Store.updateOne({ id }, update)
    return updated
}

update.config = {
    required: ['id'],
    permissions: ['store:update']
}
