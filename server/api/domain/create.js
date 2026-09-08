import { clearDomainCache } from '#server/utils/resolveDomainId.js'

export default async function create(payload, { DL, _admin, utils }) {
    const { name, url } = payload
    let { isDefault } = payload
    // native HTML checkboxes serialize as "on" — accept common truthy spellings
    if (typeof isDefault === 'string') isDefault = ['on', 'true', '1'].includes(isDefault.toLowerCase())

    const domain = { name }
    if (url != null && String(url).trim() !== '') {
        domain.url = utils.normalizeDomain(url)
    }
    if (isDefault != null) domain.isDefault = !!isDefault

    const created = await DL.Domain.create(domain)
    if (created?.isDefault) {
        // single default invariant: unset all others
        await DL.Domain.update({ id: { $ne: created.id } }, { isDefault: false })
    }
    clearDomainCache()
    return created
}

create.config = {
    required: ['name'],
    permissions: ['domain:create']
}