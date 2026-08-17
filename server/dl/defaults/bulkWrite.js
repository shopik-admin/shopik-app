import { CACHE_STRATEGIES } from '#common/constants.js'

export default (Model) => async function bulkWrite({
    docs,
    getFilter = doc => ({ id: doc.id }),
    getUpsert = doc => true,
    getUpdate = doc => ({ $set: doc }),
    getCacheFilter
}) {
    if (!Array.isArray(docs) || docs.length === 0)
        return { insertedCount: 0, modifiedCount: 0 }

    if (Model.cacheStrategy) {
        if (!getCacheFilter) {
            const docsHaveIds = docs.every(d => d.id)
            if (docsHaveIds) {
                getCacheFilter = docs => ({ id: { $in: docs.map(d => d.id) } })
            } else {
                const sampleFilter = getFilter(docs[0])
                const filterKeys = Object.keys(sampleFilter)
                const filterHasOneKey = filterKeys.length === 1
                if (filterHasOneKey) {
                    const [key] = filterKeys
                    getCacheFilter = docs => ({ [key]: { $in: docs.map(d => d[key]) } })
                }
            }
        }
        if (!getCacheFilter)
            throw { status: 400, message: 'Bulk write on this collection requires a getCacheFilter method' }
    }

    const bulkOps = docs.map(doc => ({
        updateOne: {
            filter: getFilter(doc),
            update: getUpdate(doc),
            upsert: getUpsert(doc)
        }
    }))

    const res = await Model.bulkWrite(bulkOps, { ordered: false })

    if (Model.cacheStrategy) {
        const cacheFilter = getCacheFilter(docs)
        if (Model.cacheStrategy === CACHE_STRATEGIES.HASHSET) {
            const docsToUpdate = await Model.find(cacheFilter, { _id: 0 }).lean()
            await Model.cache.add(docsToUpdate)
        } else {
            const docIdsToDel = await Model.distinct('id', cacheFilter)
            await Model.cache.del(docIdsToDel)
        }
    }

    return res
}