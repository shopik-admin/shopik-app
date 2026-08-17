export default async function create(payload, { DL, _admin }) {
    const { domainId } = payload

    const domain = await DL.Domain.readById(domainId)
    if (!domain)
        throw { status: 400, message: 'invalid domain id' }

    const created = await DL.Setting.create(payload)
    return created
}

create.config = {
    required: ['key', 'value', 'domainId'],
    permissions: ['setting:create']
}