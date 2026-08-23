import { findByLocation } from '#server/external/supplyArea.js'

export default async function lookup(payload, { DL }) {
    const lngNum = parseFloat(payload.lng)
    const latNum = parseFloat(payload.lat)

    if (!Number.isFinite(lngNum) || !Number.isFinite(latNum))
        throw { status: 400, message: 'Missing or invalid lng or lat' }

    const area = await findByLocation(DL, { type: 'Point', coordinates: [lngNum, latNum] })

    return { area: area || null, hasService: !!area }
}

lookup.config = { auth: 'none' }