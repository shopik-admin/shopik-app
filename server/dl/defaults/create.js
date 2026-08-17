import { CACHE_STRATEGIES } from '#common/constants.js'
import handleMongoError from '#server/dl/handleMongoError.js'

export default Model => async function create(data) {
    const createFunction = Array.isArray(data) ? 'insertMany' : 'create'
    try {
        const doc = await Model[createFunction](data)
        if (Model.cacheStrategy) {
            try {
                if (Model.cacheStrategy === CACHE_STRATEGIES.HASHSET)
                    await Model.cache.add(doc)
            } catch (error) {
                console.log(error)
            }
        }

        return doc
    } catch (e) {
        handleMongoError(e)
    }
}