import regex from '#common/functions/regex.js'

/**
 * POST /api/supply_area/notify
 * payload: { email, address: { city, street, building, apartment, location, areaId } }
 * Saves a "notify me when we reach this area" request. Repeat submissions for
 * the same email + address update the existing request instead of duplicating.
 */
export default async function notify(payload, { DL, _user }) {
    const email = String(payload.email || '').trim().toLowerCase()
    if (!regex.email.test(email))
        throw { status: 400, message: 'invalid email' }

    const shippingAddress = normalizeAddress(payload.address)
    const addressKey = [
        shippingAddress.city,
        shippingAddress.street,
        shippingAddress.building ?? '',
        shippingAddress.apartment ?? ''
    ].join('|')

    const existing = await DL.SupplyAreaNotification.readOne({ email, addressKey })
    const userId = _user?.id || existing?.userId
    if (existing) {
        await DL.SupplyAreaNotification.updateOne(
            { id: existing.id },
            { $set: { address: shippingAddress, ...(userId ? { userId } : {}) } }
        )
        return { ok: true, notificationId: existing.id }
    }

    try {
        const notification = await DL.SupplyAreaNotification.create({
            email,
            addressKey,
            address: shippingAddress,
            ...(userId ? { userId } : {})
        })
        return { ok: true, notificationId: notification.id }
    } catch (error) {
        // A concurrent double-tap may win the unique index race; that is a
        // successful request from the shopper's point of view.
        if (error?.status === 409 || error?.code === 11000)
            return { ok: true }
        throw error
    }
}

function normalizeAddress(address = {}) {
    const building = toNumber(address.building)
    const apartment = toNumber(address.apartment)
    const coordinates = Array.isArray(address.location?.coordinates)
        ? address.location.coordinates.map(Number).filter(Number.isFinite)
        : []

    return {
        city: String(address.city || '').trim(),
        street: String(address.street || '').trim(),
        building,
        apartment,
        areaId: address.areaId || null,
        ...(coordinates.length === 2
            ? { location: { type: 'Point', coordinates } }
            : {})
    }
}

function toNumber(value) {
    if (value == null || value === '') return null
    const num = Number(value)
    return Number.isFinite(num) ? num : null
}

notify.config = { auth: 'lax', required: ['email'] }
