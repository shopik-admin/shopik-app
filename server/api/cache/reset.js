import { CACHE_STRATEGIES } from '#common/constants.js'
import log from '#server/utils/log.js'

async function scanDel(redis, pattern) {
    let cursor = '0'
    let deleted = 0
    do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500)
        cursor = next
        if (keys?.length) deleted += await redis.del(keys)
    } while (cursor !== '0')
    return deleted
}

export default async function reset(payload, { DL, _admin }) {
    if (_admin?.isApiKey) throw { status: 403, message: 'Forbidden' }
    if (!_admin?.isSuperAdmin) throw { status: 403, message: 'Forbidden' }

    const redis = DL.redis
    if (!redis || redis.status !== 'ready')
        throw { status: 503, message: 'Redis unavailable' }

    const models = Object.values(DL)
        .map(entry => entry?.Model)
        .filter(Model => Model?.cacheStrategy && Model?.cacheName)

    const results = []
    for (const Model of models) {
        const entry = { model: Model.modelName, cacheName: Model.cacheName, strategy: Model.cacheStrategy }
        try {
            if (Model.cacheStrategy === CACHE_STRATEGIES.HASHSET) {
                entry.deletedKeys = await redis.del(Model.cacheName)
                const docs = await Model.find({}, { _id: 0 }).lean()
                if (docs.length && Model.cache) await Model.cache.add(docs)
                entry.refilled = docs.length
            } else if (Model.cacheStrategy === CACHE_STRATEGIES.VERSION) {
                entry.deletedKeys =
                    await scanDel(redis, `${Model.cacheName}:*:version`) +
                    await scanDel(redis, `${Model.cacheName}:*:v*`)
                entry.refilled = 0
            }
        } catch (e) {
            log.error(`[Cache Reset] ${Model.modelName}:`, e?.message || e)
            entry.error = e?.message || 'failed'
        }
        results.push(entry)
    }

    try {
        results.push({ model: 'user_auth', cacheName: 'user_auth:*', deletedKeys: await scanDel(redis, 'user_auth:*') })
    } catch (e) {
        results.push({ model: 'user_auth', cacheName: 'user_auth:*', error: e?.message || 'failed' })
    }

    try {
        results.push({ model: 'menu', cacheName: 'menu', deletedKeys: await redis.del('menu') })
    } catch (e) {
        results.push({ model: 'menu', cacheName: 'menu', error: e?.message || 'failed' })
    }

    return { ok: true, results }
}

reset.config = {
    permissions: ['admin:super'],
    preventMultiple: true
}
