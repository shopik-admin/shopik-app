export default async function create(payload, { DL, _admin }) {
    const { name } = payload

    const domain = { name }

    const created = await DL.Domain.create(domain)
    return created
}

create.config = {
    required: ['name'],
    permissions: ['domain:create']
}