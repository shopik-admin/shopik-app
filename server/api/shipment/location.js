import { OPS_PROXIMITY_RADIUS_M } from '#common/constants.js'

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

export default async function location(payload, { DL, _admin }) {
    const { shipmentId, coordinates, at } = payload
    if (!shipmentId || !coordinates) throw { status: 400, message: 'shipmentId and coordinates required' }

    const shipment = await DL.Shipment.readById(shipmentId)
    if (!shipment) throw { status: 404, message: 'shipment not found' }
    if (shipment.shipper?.adminId !== _admin.id && !_admin.isSuperAdmin) throw { status: 403, message: 'not your shipment' }

    await DL.Shipment.Model.updateOne(
        { id: shipmentId },
        {
            $set: { currentLocation: { type: 'Point', coordinates } },
            $push: { path: { at: at ? new Date(at) : new Date(), coordinates } }
        }
    )

    try { await DL.Admin.updateOne({ id: _admin.id }, { lastLocation: { type: 'Point', coordinates } }) } catch {}

    // cap path length ~500
    try {
        const fresh = await DL.Shipment.readById(shipmentId)
        if (fresh?.path?.length > 500) {
            await DL.Shipment.Model.updateOne({ id: shipmentId }, { $set: { path: fresh.path.slice(-500) } })
        }
    } catch {}

    try {
        await DL.ShipHistory.create({
            shipmentId,
            storeId: shipment.storeId,
            shipperAdminId: _admin.id,
            type: 'location',
            location: { type: 'Point', coordinates },
            at: at ? new Date(at) : new Date()
        })
    } catch {}

    // proximity check
    const orders = await DL.Order.Model.find({ id: { $in: shipment.orderIds, } }, { _id: 0, id: 1, address: 1, status: 1 }).lean()
    const within = []
    for (const o of orders) {
        if (o.status !== 'shipped') continue
        const c = o.address?.location?.coordinates
        if (!c) continue
        const d = haversine(coordinates, c)
        if (d <= OPS_PROXIMITY_RADIUS_M) within.push({ orderId: o.id, distanceM: Math.round(d) })
    }

    return { within, radiusM: OPS_PROXIMITY_RADIUS_M }
}

location.config = {
    permissions: ['order:ship'],
    log: false
}
