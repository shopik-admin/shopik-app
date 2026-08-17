import diff from '#common/functions/diff.js'

export default async function update(payload, { DL, _admin }) {
    const { id } = payload

    const domain = await DL.Domain.readById(id)
    if (!domain)
        throw { status: 400, message: 'domain does not exist' }

    const update = diff(domain, payload)

    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate)
        return domain

    const updated = await DL.Domain.updateOne({ id }, update)
    return updated
}

update.config = {
    required: ['id'],
    permissions: ['domain:update']
}