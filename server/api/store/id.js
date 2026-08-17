export default async function id({ id }, { DL, _admin }) {
    const store = await DL.Store.readById(id)
    return store
}

id.config = {
    required: ['id'],
    permissions: ['store:id']
}
