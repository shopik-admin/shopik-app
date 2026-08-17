export default (Model) => async function count(filter, search) {
    const processedFilter = Model.processFilter(filter, search)
    return Model.countDocuments(processedFilter)
}