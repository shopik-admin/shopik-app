import storeScope, { assertStoreVisible } from '#server/utils/data/storeScope.js'

export default async function id({ id }, { DL, _admin }) {
    const scope = await storeScope({ DL, _admin })
    assertStoreVisible(id, scope)
    const store = await DL.Store.readById(id)
    return store
}

id.config = {
    required: ['id'],
    permissions: ['store:id']
}
