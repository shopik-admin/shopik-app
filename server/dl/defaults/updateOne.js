import { CACHE_STRATEGIES } from '#common/constants.js'
import handleMongoError from '#server/dl/handleMongoError.js'
import handleSelect from '#server/dl/handleSelect.js'
import log from '#server/utils/log.js'

export default Model => async function updateOne(filter = {}, update, options = {}) {
    const {
        select = {},
        upsert,
        runValidators = true
    } = options

    const { cacheStrategy } = Model
    if (cacheStrategy && Object.keys(select).length)
        select.id = 1

    try {
        const doc = await Model.findOneAndUpdate(
            filter,
            update,
            {
                returnDocument: 'after',
                runValidators,
                projection: { _id: 0 },
                upsert
            }
        ).lean()

        if (cacheStrategy) {
            try {
                if (cacheStrategy === CACHE_STRATEGIES.HASHSET)
                    await Model.cache.add(doc)
                else
                    await Model.cache.del(doc.id)
            } catch (error) {
                log.error('Cache error:', error)
            }
        }

        return handleSelect(doc, select)
    } catch (e) {
        handleMongoError(e)
    }
}
