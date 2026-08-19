export default async function create(payload, { DL, utils, external }) {
    const address = utils.extractFields.getAddress(payload)
    payload.address = await external.geocode.address(address)

    const tagExists = await DL.Store.count({ tag: payload.tag })
    if (tagExists) throw { status: 400, message: 'tag already exists' }

    const created = await DL.Store.create(payload)
    return created
}

create.config = {
    required: ['address.city', 'address.street', 'address.building', 'tag'],
    permissions: ['store:create']
} 