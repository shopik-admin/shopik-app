import diff from '#common/functions/diff.js'
import { normalizePolygon, validatePolygon, validateNoOverlap } from '#server/external/supplyArea.js'

function normalizeStores(stores) {
    return stores.map(store => typeof store === 'string' ? { storeId: store } : store)
}

export default async function update(payload, { DL }) {
    const { id } = payload
    if (!id) throw { status: 400, message: 'Missing id' }

    const area = await DL.SupplyArea.readById(id)
    if (!area) throw { status: 404, message: 'Supply area not found' }

    const update = diff(area, payload)
    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate) return area

    if (update.location) {
        validatePolygon(update.location)
        const normalizedLocation = normalizePolygon(update.location)
        await validateNoOverlap(DL, normalizedLocation, id)
        update.location = normalizedLocation
    }

    if (update.stores) {
        update.stores = normalizeStores(update.stores)
    }

    const updated = await DL.SupplyArea.updateOne({ id }, update)
    return updated
}

update.config = {
    required: ['id'],
    permissions: ['supply_area:update']
}