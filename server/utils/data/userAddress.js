import uid from '#common/functions/uid.js'
import { isElevatorRequired } from '#common/functions/address.js'
import { findByLocation } from '#server/external/supplyArea.js'
import {
    addressNotFoundError,
    addressRecordNotFoundError,
    elevatorRequiredError
} from '#server/utils/addressErrors.js'

// Shared address geocoding + area resolution used by both the client
// self-service endpoints (user/address/*, _user-scoped) and the admin
// endpoints (user/address/admin_*, userId-scoped).

const normalizeHasElevator = value => value !== false

function assertGeocoded(geocoded) {
    if (!geocoded?.location?.coordinates?.length) throw addressNotFoundError()
}

// `source` describes the response; `geocodeSource` is the persisted copy.
function applyGeocodeMeta(geocoded) {
    if (geocoded?.source) geocoded.geocodeSource = geocoded.source
    return geocoded
}

function assertElevatorAllowed(address, allowNoElevator) {
    if (allowNoElevator) return
    if (isElevatorRequired(address)) throw elevatorRequiredError()
}

export async function addAddress({ DL, external, user, address, allowNoElevator = false }) {
    const geocoded = await external.geocode.address(address)
    assertGeocoded(geocoded)
    applyGeocodeMeta(geocoded)
    geocoded.city ||= address.city
    geocoded.street ||= address.street
    geocoded.building ??= address.building
    geocoded.addressId = uid()
    geocoded.floor = address.floor
    geocoded.hasElevator = normalizeHasElevator(address.hasElevator)

    assertElevatorAllowed(geocoded, allowNoElevator)

    const area = await findByLocation(DL, geocoded.location)
    geocoded.areaId = area?.id ?? null
    geocoded.hasService = !!area

    const hasActiveAddress = user.addresses && user.addresses.some(a => a.active)
    geocoded.active = !hasActiveAddress && geocoded.hasService

    return geocoded
}

const sameLocationFields = [
    'city',
    'street',
    'building',
    'apartment',
    'residenceType'
]

export const isSameAddressLocation = (address1, address2) => {
    const sameFields = sameLocationFields.every(f =>
        String(address1?.[f] ?? '') === String(address2?.[f] ?? '')
    )
    const sameLocation = JSON.stringify(address1?.location?.coordinates) === JSON.stringify(address2?.location?.coordinates)
    return sameFields && sameLocation
}

export async function editAddress({ DL, external, user, addressId, address, allowNoElevator = false }) {
    const existingAddr = (user.addresses || []).find(a => a.addressId === addressId)
    if (!existingAddr) throw addressRecordNotFoundError()

    const geocoded = (await external.geocode.address(address)) || {}
    const sameParts = ['city', 'street', 'building'].every(field =>
        String(address[field] ?? '').trim() === String(existingAddr[field] ?? '').trim()
    )
    // No trustworthy point: keep the old one only while the address itself did
    // not change. A changed address must not silently inherit a wrong point.
    if (!geocoded.location) {
        if (!sameParts || !existingAddr.location?.coordinates?.length) throw addressNotFoundError()
        geocoded.location = existingAddr.location
        geocoded.accuracy = existingAddr.accuracy
        geocoded.geocodeSource = existingAddr.geocodeSource
    }
    applyGeocodeMeta(geocoded)
    geocoded.city ||= address.city || existingAddr.city
    geocoded.street ||= address.street || existingAddr.street
    geocoded.building ??= address.building ?? existingAddr.building
    geocoded.addressId = addressId
    geocoded.name = address.name ?? existingAddr.name
    geocoded.floor = address.floor ?? existingAddr.floor
    geocoded.hasElevator = normalizeHasElevator(address.hasElevator ?? existingAddr.hasElevator)

    assertElevatorAllowed(geocoded, allowNoElevator)

    const area = await findByLocation(DL, geocoded.location)
    geocoded.areaId = area?.id ?? null
    geocoded.hasService = !!area
    geocoded.active = existingAddr.active && geocoded.hasService

    return { geocoded, existingAddr }
}
