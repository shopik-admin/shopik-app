export default async function create(payload, { DL, utils, external }) {
    const address = utils.extractFields.getAddress(payload)
    if (!address)
        throw { status: 400, message: 'missing required address fields' }

    payload.address = await external.geocode.address(address)

    const created = await DL.Store.create(payload)
    return created
}

create.config = {
    required: [],
    permissions: ['store:create']
} 