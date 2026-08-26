export default async function rateLimit(DL, key, identifier, max, windowSec) {
    if (!DL.redis || !identifier)
        return
    const redisKey = `rl:${key}:${identifier}`
    let count
    try {
        count = await DL.redis.incr(redisKey)
        if (count === 1)
            await DL.redis.expire(redisKey, windowSec)
    } catch {
        return
    }
    if (count > max)
        throw { status: 429, message: 'Too many requests, please try again later' }
}
