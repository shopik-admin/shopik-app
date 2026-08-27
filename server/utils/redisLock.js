export async function acquireLock(redis, key, ttlSeconds) {
    if (!redis) return null
    const token = `${process.pid}-${Date.now()}`
    const ok = await redis.set(key, token, 'EX', ttlSeconds, 'NX')
    if (!ok) return null
    return async () => {
        try {
            const current = await redis.get(key)
            if (current === token) await redis.del(key)
        } catch {
            // lock expires on its own via TTL
        }
    }
}
