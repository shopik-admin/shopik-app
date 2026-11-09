export const MAX_FLOOR_WITHOUT_ELEVATOR = 4

export function isElevatorRequired({ floor, hasElevator } = {}) {
    if (hasElevator !== false) return false
    const floorNumber = parseInt(String(floor ?? '').trim(), 10)
    return Number.isFinite(floorNumber) && floorNumber > MAX_FLOOR_WITHOUT_ELEVATOR
}

// AddressForm calls onDone with the raw API response ({ user, order, address }).
// Return the saved address only when it was saved outside the service area, so
// a successful save is never mistaken for a no-service address.
export function noServiceAddressFromSave(res) {
    return res?.address?.hasService === false ? res.address : null
}

// Keep the selected address at the top of every address list. Array#sort is
// stable, so the remaining addresses retain their original order.
export function sortAddressesActiveFirst(addresses = []) {
    return [...addresses].sort((a, b) => Number(!!b.active) - Number(!!a.active))
}
