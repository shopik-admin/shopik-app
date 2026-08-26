import safeJsonParse from '#common/functions/safeJsonParse.js'

const SETTINGS_CACHE_KEY = 'settings:tree'
const SETTINGS_CACHE_TTL_SECONDS = 300

export default async function getSettings({ DL }) {
    try {
        const cached = await DL.redis?.get(SETTINGS_CACHE_KEY)
        if (cached) return safeJsonParse(cached)
    } catch {}

    const settings = await DL.Setting.read({}, { _id: 0 }, { limit: 0 })
    const settingsTree = settings.reduce((acc, s) => {
        if (!acc[s.category]) acc[s.category] = {}
        acc[s.category][s.key] = s.value
        return acc
    }, {})

    try {
        await DL.redis?.set(SETTINGS_CACHE_KEY, JSON.stringify(settingsTree), 'EX', SETTINGS_CACHE_TTL_SECONDS)
    } catch {}

    return settingsTree
}
