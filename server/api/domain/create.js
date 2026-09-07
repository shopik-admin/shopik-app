export default async function create(payload, { DL, _admin, utils }) {
    const { name, url } = payload

    const domain = { name }
    if (url != null && String(url).trim() !== '') {
        domain.url = utils.normalizeDomain(url)
    }

    const created = await DL.Domain.create(domain)
    return created
}

create.config = {
    required: ['name'],
    permissions: ['domain:create']
}