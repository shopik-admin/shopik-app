export default async function create(payload, { DL }) {
    const { storeId, master, windows } = payload
    if (!master && !storeId)
        throw { status: 400, message: 'master or store id are required' }

    if (!windows?.length)
        throw { status: 400, message: 'at least one window is required' }

    if (storeId) {
        delete payload.master
        const storeExists = await DL.OrderWindowTemplate.count({ storeId, active: true })
        if (storeExists)
            throw { status: 400, message: 'store template already exists' }
    } else if (master) {
        const masterExists = await DL.OrderWindowTemplate.count({ master, active: true })
        if (masterExists)
            throw { status: 400, message: 'master template already exists' }
    }


    const invaildWindows = windows.some(w => w.start >= w.end)
    if (invaildWindows) throw { status: 400, message: 'windows start must be less than end' }

    const created = await DL.OrderWindowTemplate.create(payload)
    return created
}

create.config = {
    permissions: 'order_window_template:create'
}
