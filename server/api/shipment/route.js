import distanceMeters from '#common/functions/distance.js'

export default async function route(payload, { DL, _admin, external }) {
    const { shipmentId, origin } = payload
    if (!shipmentId) throw { status: 400, message: 'shipmentId required' }

    const shipment = await DL.Shipment.readById(shipmentId)
    if (!shipment) throw { status: 404, message: 'shipment not found' }
    if (shipment.shipper?.adminId !== _admin.id && !_admin.isSuperAdmin) throw { status: 403, message: 'not your shipment' }

    const orders = await DL.Order.Model.find({ id: { $in: shipment.orderIds } }, { _id: 0, id: 1, address: 1 }).lean()

    // geocode missing locations
    for (const o of orders) {
        if (!o.address?.location?.coordinates?.length) {
            try {
                const geocoded = await external?.geocode?.address?.(o.address) || o.address
                if (geocoded?.location?.coordinates?.length) {
                    await DL.Order.Model.updateOne({ id: o.id }, { $set: { 'address.location': geocoded.location } })
                    o.address.location = geocoded.location
                }
            } catch {}
        }
    }

    let remaining = orders.map(o => ({ orderId: o.id, coords: o.address?.location?.coordinates }))
    const seq = []
    let current = origin || shipment.startLocation?.coordinates || shipment.currentLocation?.coordinates || remaining.find(r => r.coords)?.coords
    let counter = 0

    if (!current) {
        remaining.forEach((r, i) => seq.push({ orderId: r.orderId, seq: i }))
    } else {
        const pool = remaining.filter(r => r.coords)
        const noGeo = remaining.filter(r => !r.coords)
        let cur = current
        const used = new Set()
        while (pool.length !== used.size) {
            let best = null, bestDist = Infinity, bestIdx = -1
            pool.forEach((p, idx) => {
                if (used.has(idx)) return
                const d = distanceMeters(cur, p.coords)
                if (d < bestDist) { bestDist = d; best = p; bestIdx = idx }
            })
            if (best == null) break
            used.add(bestIdx)
            seq.push({ orderId: best.orderId, seq: counter++ })
            cur = best.coords
        }
        noGeo.forEach(r => seq.push({ orderId: r.orderId, seq: counter++ }))
    }

    await DL.Shipment.updateOne({ id: shipmentId }, { routeOrder: seq })

    return { routeOrder: seq, orders: orders.map(o => ({ id: o.id, address: o.address })) }
}

route.config = {
    permissions: ['order:ship']
}
