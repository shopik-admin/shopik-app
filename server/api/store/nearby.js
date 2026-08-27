export default async function nearby(payload, { DL, _admin }) {
    const { coordinates } = payload
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2)
        throw { status: 400, message: 'coordinates [lng, lat] required' }

    const admin = await DL.Admin.readById(_admin.id)
    const isSuper = _admin.isSuperAdmin

    let storeFilter = { active: true }
    if (!isSuper) {
        if (!admin?.storeIds?.length) return []
        storeFilter.id = { $in: admin.storeIds }
    }

    const stores = await DL.Store.Model.aggregate([
        {
            $geoNear: {
                near: { type: 'Point', coordinates },
                distanceField: 'distanceM',
                spherical: true,
                query: storeFilter
            }
        },
        {
            $project: {
                _id: 0,
                id: 1,
                name: 1,
                address: 1,
                distanceM: 1
            }
        }
    ])

    return stores
}

nearby.config = {
    permissions: ['store:read']
}
