import { CACHE_STRATEGIES } from '#common/constants.js'

export default (Model) => async function read(filter = {}, select = { _id: 0 }, options = {}) {
    if (Model.cacheStrategy === CACHE_STRATEGIES.HASHSET)
        return Model.cache.read(...arguments)

    const { search, skip = 0, limit = 30, sort } = options
    const processedFilter = Model.processFilter(filter, search)

    return Model.find(processedFilter)
        .select(select)
        .sort(sort)
        .skip(skip ? Number(skip) : undefined)
        .limit(limit ? Number(limit) : undefined)
        .lean()
}