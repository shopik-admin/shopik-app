import { CITY_BORDERS_KEY } from '#server/external/cityBorders.js'

// Resolve the published city-borders file for map users (who don't have
// `setting:read`). Returns { url: null } until the first publish.
export default async function city_borders(payload, { DL }) {
    const def = await DL.Domain.readOne({ isDefault: true, active: true }, { _id: 0, id: 1 })
    if (!def?.id)
        return { url: null }

    const setting = await DL.Setting.readOne({ domainId: def.id, key: CITY_BORDERS_KEY })
    const path = typeof setting?.value === 'string' && setting.value ? setting.value : null
    if (!path)
        return { url: null }

    const base = (process.env.FILES_BASE_URL || '').replace(/\/+$/, '')
    return { url: `${base}/${path}`, path }
}

city_borders.config = {
    permissions: ['supply_area:read']
}
