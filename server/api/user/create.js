export default async function create(payload, { DL, utils }) {
    const name = utils.extractFields.getName(payload)
    if (name) payload.name = name

    return await DL.User.create(payload)
}

create.config = { permissions: 'user:create' }
