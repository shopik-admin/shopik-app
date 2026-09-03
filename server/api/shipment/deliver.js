import { OPS_PROXIMITY_RADIUS_M } from '#common/constants.js'
import sharp from 'sharp'

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

export default async function deliver(payload, { DL, _admin, external, utils }) {
    const { orderId, imageBase64, coordinates, force } = payload
    if (!orderId || !imageBase64) throw { status: 400, message: 'orderId and imageBase64 required' }
    if (Buffer.byteLength(imageBase64, 'utf8') > 8 * 1024 * 1024) throw { status: 400, message: 'image too large' }

    const order = await DL.Order.readById(orderId)
    if (!order) throw { status: 404, message: 'order not found' }
    if (order.status !== 'shipped') throw { status: 400, message: 'order not in shipped' }

    const shipment = order.shipmentId ? await DL.Shipment.readById(order.shipmentId) : null
    if (shipment && shipment.shipper?.adminId !== _admin.id && !_admin.isSuperAdmin) throw { status: 403, message: 'not your shipment' }

    if (!force && coordinates && order.address?.location?.coordinates?.length) {
        const d = haversine(coordinates, order.address.location.coordinates)
        if (d > OPS_PROXIMITY_RADIUS_M) throw { status: 400, message: `too far: ${Math.round(d)}m > ${OPS_PROXIMITY_RADIUS_M}m (use force if GPS drift)` }
    }

    const buffer = Buffer.from(imageBase64, 'base64')
    const processed = await sharp(buffer).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()
    const path = `images/shipments/${orderId}.webp`

    let url = path
    try {
        await external.storage.uploadFile({ path, data: processed, contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' })
        url = path
    } catch (e) {
        // if storage not configured, keep local path
    }

    const at = new Date()
    await DL.Order.Model.updateOne({ id: orderId }, { $set: { status: 'done', deliveryProof: { url, at } } })

    try { await DL.Owner.updateOne({ orderId, type: 'shipping', status: 'active' }, { status: 'done', end: at }) } catch {}

    if (shipment) {
        await DL.Shipment.Model.updateOne({ id: shipment.id }, { $push: { proof: { orderId, url, at } } })
        // ship_history deliver
        try {
            await DL.ShipHistory.create({
                shipmentId: shipment.id, orderId, storeId: shipment.storeId, shipperAdminId: _admin.id,
                type: force ? 'force' : 'deliver',
                location: coordinates ? { type: 'Point', coordinates } : undefined,
                at, proofUrl: url
            })
        } catch {}

        const remaining = await DL.Order.Model.countDocuments({ id: { $in: shipment.orderIds }, status: { $ne: 'done' } })
        if (remaining === 0) {
            await DL.Shipment.updateOne({ id: shipment.id }, { status: 'done', completedAt: at })
            try { await DL.ShipHistory.create({ shipmentId: shipment.id, storeId: shipment.storeId, shipperAdminId: _admin.id, type: 'done', at, orderIds: shipment.orderIds }) } catch {}
        }
    }

    try {
        const { record, adminActor } = utils.data.timeline
        await record({ DL, order, eventType: DL.Timeline.constants.EVENT_TYPES.ORDER_STATUS_UPDATE, actor: adminActor(_admin), changes: { oldData: { status: 'shipped' }, newData: { status: 'done', deliveryProof: { url } } }, context: { step: 'deliver', force: !!force, proofUrl: url }, metadata: { source: 'shipment/deliver' } })
    } catch {}

    return { orderId, url }
}

deliver.config = {
    permissions: ['order:ship'],
    preventMultiple: p => ':' + (p.orderId || '')
}
