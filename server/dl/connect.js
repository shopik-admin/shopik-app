import log from '../utils/log.js'
import mongoose from 'mongoose'
import Redis from 'ioredis'
import handleSelect from './handleSelect.js'
import readFactory from './cache/read.js'
import { CACHE_STRATEGIES } from '#common/constants.js'
import safeJsonParse, { parseArray } from '#common/functions/safeJsonParse.js'

const getVersionCacheKey = async (redis, Model, doc) => {
    const cachePrefix = `${Model.cacheName}:${doc.id}`
    let cacheVersion = await redis.set(`${cachePrefix}:version`, '1', 'NX', 'GET')
    if (!cacheVersion)
        cacheVersion = '1'

    return `${cachePrefix}:v${cacheVersion}`
}

const versionCache = async (redis, Model, doc) => {
    if (!doc.id) throw 'id is required for cache'
    const cacheKey = await getVersionCacheKey(redis, Model, doc)
    try {
        await redis.set(cacheKey, JSON.stringify(doc), 'EX', 24 * 60 * 60)
    } catch (e) { log.error('Cache[version] write error:', e) }
}

const hashCache = async (redis, Model, docs) => {
    if (Array.isArray(docs)) {
        if (!docs.length) return
        await redis.hset(
            Model.cacheName,
            Object.fromEntries(
                docs.map(doc => [doc.id, JSON.stringify(doc)])
            )
        )
    } else {
        await redis.hset(
            Model.cacheName,
            { [docs.id]: JSON.stringify(docs) }
        )
    }
}

async function connectRedis() {
    const redisUrl = process.env.REDIS_URL ||
        (process.env.REDIS_HOST ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}` : 'redis://localhost:6379')

    const redis = new Redis(redisUrl, {
        connectTimeout: 2000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
        retryStrategy(times) {
            if (times > 3) return null
            return 1000
        }
    })

    redis.on('error', err => log.warn('Redis notice:', err?.message || err))

    try {
        await Promise.race([
            redis.connect(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connect timeout (2s)')), 2000))
        ])
        log.success('Redis connection established!')
    } catch (e) {
        log.warn('Redis connection deferred, proceeding with direct database access:', e?.message || e)
    }

    redis.init = Model => {
        const get = async (ids, select) => {
            let results
            if (Model.cacheStrategy === CACHE_STRATEGIES.VERSION) {
                if (typeof ids === 'string') {
                    const cacheKey = await getVersionCacheKey(redis, Model, { id: ids })
                    const cacheValue = await redis.get(cacheKey)
                    if (!cacheValue) return null
                    results = safeJsonParse(cacheValue)
                } else if (Array.isArray(ids)) {
                    const cacheKeys = await Promise.all(
                        ids.map(id => getVersionCacheKey(redis, Model, { id }))
                    )
                    const cacheValues = await redis.mget(cacheKeys)
                    results = parseArray(cacheValues)
                }
            }
            if (Model.cacheStrategy === CACHE_STRATEGIES.HASHSET) {
                if (Array.isArray(ids))
                    ids = [...new Set(ids)]
                const values = await redis.hmget(Model.cacheName, ids)
                if (Array.isArray(ids))
                    results = parseArray(values)
                else {
                    const [cacheValue] = values
                    if (!cacheValue) return null

                    results = safeJsonParse(cacheValue)
                }
            }
            return handleSelect(results, select)
        }

        const add = async (docs) => {
            if (Model.cacheStrategy === CACHE_STRATEGIES.VERSION) {
                if (Array.isArray(docs)) {
                    if (!docs?.length) return
                    await Promise.all(docs.map(doc => versionCache(redis, Model, doc)))
                } else {
                    await versionCache(redis, Model, docs)
                }
                return
            }
            if (Model.cacheStrategy === CACHE_STRATEGIES.HASHSET) {
                await hashCache(redis, Model, docs)
                return
            }
        }

        const del = async (ids) => {
            if (!ids?.length) return
            if (Model.cacheStrategy === CACHE_STRATEGIES.HASHSET) {
                await redis.hdel(Model.cacheName, ids)
                return
            }
            if (Model.cacheStrategy === CACHE_STRATEGIES.VERSION) {
                const prefix = Model.cacheName
                if (typeof ids === 'string') {
                    await redis.incr(`${prefix}:${ids}:version`)
                }
                if (Array.isArray(ids)) {
                    const pipeline = redis.multi()
                    for (const id of ids) {
                        pipeline.incr(`${prefix}:${id}:version`)
                    }
                    await pipeline.exec()
                }
                return
            }
        }

        const read = readFactory(redis, Model)

        return {
            read,
            get,
            add,
            del
        }
    }

    return redis
}

const getDisconnect = redis => async function disconnect() {
    try {
        await mongoose.disconnect()
        if (redis) await redis.quit()
        log.log('Server shut down gracefully')
    } catch (e) {
        log.error('Shutdown error:', e)
    }
}

const getHealth = redis => async function health() {
    const mongoOk = mongoose.connection.readyState === 1
    const redisOk = redis ? await redis.ping() : false
    return { mongo: mongoOk, redis: redisOk === 'PONG' }
}

export default async function connect() {
    log.warn('MongoDB connecting...')

    try {
        const mongoUri = process.env.DB_URI || process.env.DB
        if (!mongoUri) {
            throw new Error('No MongoDB connection string provided in DB_URI or DB environment variable')
        }
        await mongoose.connect(mongoUri)
        log.success('MongoDB connection established!')
    } catch (error) {
        log.error('MongoDB connection failed!')
        throw error
    }

    log.warn('Redis connecting...')

    let redis = null

    try {
        redis = await connectRedis()
    } catch (error) {
        log.warn('Redis connection skipped:', error?.message || error)
    }

    return {
        redis,
        disconnect: getDisconnect(redis),
        health: getHealth(redis)
    }
}