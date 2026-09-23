import storage from '#server/external/storage.js'
import { CITY_BORDERS_KEY, CITY_BORDERS_CATEGORY, CITY_BORDERS_SUB_CATEGORY, validateCityBorders } from '#server/external/cityBorders.js'

const MAX_BYTES = 8 * 1024 * 1024

function defaultVersion() {
    return `v${new Date().toISOString().slice(0, 10)}`
}

// Publish a new city-borders GeoJSON: validate → versioned GCS upload →
// store the relative path in a `file`-type setting. The map picks it up
// on next load with no code change or redeploy.
export default async function upload_city_borders(payload, { DL, _admin }) {
    if (!_admin?.isSuperAdmin)
        throw { status: 403, message: 'Forbidden' }

    let fc = payload?.geojson
    if (typeof fc === 'string') {
        try {
            fc = JSON.parse(fc)
        } catch {
            throw { status: 400, message: 'invalid geojson: unparseable JSON' }
        }
    }
    if (!fc)
        throw { status: 400, message: 'missing geojson' }

    const { features } = validateCityBorders(fc)

    const version = payload?.version || defaultVersion()
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(version))
        throw { status: 400, message: 'invalid version: use letters, digits, _ or -' }

    const data = Buffer.from(JSON.stringify(fc))
    if (data.length > MAX_BYTES)
        throw { status: 400, message: 'geojson too large (max 8MB)' }

    const path = `static/geo/city-borders.${version}.geojson`
    try {
        await storage.uploadFile({
            path,
            data,
            contentType: 'application/geo+json',
            cacheControl: 'public, max-age=31536000, immutable',
            public: true
        })
    } catch (e) {
        if (e?.message === 'MAKE_PUBLIC_FAILED')
            throw { status: 500, message: 'file uploaded but could not be made public — grant the uploads service account "Storage Object Admin" on the bucket, then publish again' }
        throw e
    }

    const def = await DL.Domain.readOne({ isDefault: true, active: true }, { _id: 0, id: 1 })
    if (!def?.id)
        throw { status: 500, message: 'no default domain configured' }

    const existing = await DL.Setting.readOne({ domainId: def.id, key: CITY_BORDERS_KEY })
    if (!existing) {
        await DL.Setting.create({
            key: CITY_BORDERS_KEY,
            value: path,
            category: CITY_BORDERS_CATEGORY,
            subCategory: CITY_BORDERS_SUB_CATEGORY,
            domainId: def.id,
            formType: 'file',
            renderType: 'string',
            public: false
        })
    } else if (existing.value !== path) {
        await DL.Setting.updateOne({ id: existing.id }, { value: path })
    }

    const base = (process.env.FILES_BASE_URL || '').replace(/\/+$/, '')
    return { url: `${base}/${path}`, path, features, bytes: data.length }
}

upload_city_borders.config = {
    required: ['geojson'],
    permissions: ['admin:super'],
    // Never store the 2MB payload in request logs.
    log: false
}
