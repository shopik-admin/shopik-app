import { sanitizeGroupCapacities } from '#server/utils/data/windowGroups.js'

export default async function create(payload, { DL }) {
    const { storeId, master } = payload

    if (payload.copyFrom) {
        const source = await DL.OrderWindowTemplate.readById(payload.copyFrom)
        if (!source) throw { status: 400, message: 'source template not found' }
        payload.windows = source.windows
        payload.leadHours = payload.leadHours ?? source.leadHours
        payload.timezone = payload.timezone ?? source.timezone
    }

    if (!master && !storeId)
        throw { status: 400, message: 'master or store id are required' }

    if (!payload.windows?.length)
        throw { status: 400, message: 'at least one window is required' }

    // Raw countDocuments: the generic count() whitelist would strip these filters
    if (storeId) {
        delete payload.master
        const storeExists = await DL.OrderWindowTemplate.Model.countDocuments({ storeId, active: true })
        if (storeExists)
            throw { status: 400, message: 'store template already exists' }
    } else if (master) {
        const masterExists = await DL.OrderWindowTemplate.Model.countDocuments({ master: true, active: true })
        if (masterExists)
            throw { status: 400, message: 'master template already exists' }
    }


    const invaildWindows = payload.windows.some(w => w.start >= w.end)
    if (invaildWindows) throw { status: 400, message: 'windows start must be less than end' }

    // Area-group capacities are per-store; a master template is store-agnostic
    // so its group config is always stripped. copyFrom windows pass through the
    // same validation.
    payload.windows = payload.windows.map(w => ({
        ...w,
        areaGroups: master ? [] : sanitizeGroupCapacities(w.areaGroups, w.maxCapacity)
    }))

    const created = await DL.OrderWindowTemplate.create(payload)
    return created
}

create.config = {
    permissions: 'order_window_template:create'
}
