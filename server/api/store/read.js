import storeScope, { scopeStoreFilter } from '#server/utils/data/storeScope.js'

export default async function read(payload, { DL, _admin }) {
    const { filter = {}, select } = payload
    const scope = storeScope({ _admin })
    return DL.Store.read(scopeStoreFilter(filter, scope), select, payload)
}

read.config = {
    permissions: ['store:read']
}
