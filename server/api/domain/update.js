import diff from '#common/functions/diff.js'
import { clearDomainCache } from '#server/utils/resolveDomainId.js'

export default async function update(payload, { DL, _admin, utils }) {
    const { id } = payload

    const domain = await DL.Domain.readById(id)
    if (!domain)
        throw { status: 400, message: 'domain does not exist' }

    const normalized = { ...payload }
    // native HTML checkboxes serialize as "on" — accept common truthy spellings
    if (typeof normalized.isDefault === 'string') {
        normalized.isDefault = ['on', 'true', '1'].includes(normalized.isDefault.toLowerCase())
    }
    if (normalized.url != null) {
        normalized.url = String(normalized.url).trim() === ''
            ? null
            : utils.normalizeDomain(normalized.url)
    }

    const update = diff(domain, normalized)

    if (update.isDefault === true) {
        // single default invariant: unset all others first
        await DL.Domain.update({ id: { $ne: id } }, { isDefault: false })
    } else if (update.isDefault === false && domain.isDefault) {
        // forbid orphaning the system with zero defaults
        const other = await DL.Domain.readOne({ isDefault: true, id: { $ne: id } }, { _id: 0, id: 1 })
        if (!other)
            throw { status: 400, message: 'cannot unset the last default domain' }
    }

    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate)
        return domain

    const updated = await DL.Domain.updateOne({ id }, update)
    clearDomainCache()
    return updated
}

update.config = {
    required: ['id'],
    permissions: ['domain:update']
}