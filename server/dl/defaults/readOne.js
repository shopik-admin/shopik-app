export default (Model) => async function readOne(filter, select = {}) {
    // warn about no index for filter :O
    return Model.findOne(filter, select).lean()
}