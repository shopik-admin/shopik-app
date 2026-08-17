import log from '#server/utils/log.js'
import handleSelect from '#server/dl/handleSelect.js'

export default (Model) => async function readById(id, select = {}) {
    if (Model.cacheStrategy) {
        try {
            const cached = await Model.cache.get(id, select)
            if (cached !== null)
                return cached
        } catch (e) {
            log.error('Cache error:', e)
        }
    }

    const doc = await Model.findOne({ id }, { _id: 0 }).lean()
    if (doc && Model.cacheStrategy) {
        try {
            await Model.cache.add(doc)
        } catch (e) {
            console.log(e)
        }
    }

    return handleSelect(doc, select)
}