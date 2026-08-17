export default async function id({ id }, { DL, _admin }) {
    const domain = await DL.Domain.readById(id)
    return domain
}

id.config = {
    required: ['id'],
    permissions: ['domain:id']
}