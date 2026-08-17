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
    const redis = new Redis(process.env.REDIS_URL)
    await redis.ping()

    redis.on('error', err => log.error('Redis connection error:', err))

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
        await mongoose.connect(process.env.DB)
        log.success('MongoDB connection established!')
    } catch (error) {
        log.error('MongoDB connection failed!')
        throw error
    }

    log.warn('Redis connecting...')

    let redis = null

    try {
        redis = await connectRedis()
        log.success('Redis connection established!')
    } catch (error) {
        log.error('Redis connection failed!')
    }

    return {
        redis,
        disconnect: getDisconnect(redis),
        health: getHealth(redis)
    }
}