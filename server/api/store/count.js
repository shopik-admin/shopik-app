import storeScope, { scopeStoreFilter } from '#server/utils/data/storeScope.js'

export default async function count({ filter, search }, { DL, _admin }) {
    const scope = await storeScope({ DL, _admin })
    return DL.Store.count(scopeStoreFilter(filter, scope), search)
}

count.config = {
    permissions: 'store:read'
}
