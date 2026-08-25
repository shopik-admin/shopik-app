export default (Model) => async function count(filter, search) {
    if ((!filter || !Object.keys(filter).length) && !search?.length)
        return Model.estimatedDocumentCount()
    const processedFilter = Model.processFilter(filter, search)
    return Model.countDocuments(processedFilter)
}
