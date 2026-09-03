function haversine(a, b) {
    const toRad = d => d * Math.PI / 180
    const [lng1, lat1] = a
    const [lng2, lat2] = b
    const R = 6371000
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(s))
}

export default async function route(payload, { DL, _admin }) {
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
                const geocoded = await DL.geocode?.address?.(o.address) || o.address
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
                const d = haversine(cur, p.coords)
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
