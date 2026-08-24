import uid from '#common/functions/uid.js'
import pkg from '#package.json' with { type: 'json' }
const appVersion = pkg?.version || 'unknown'

function truncateLogData(data, maxBytes = 60000) {
    if (data == null) return data
    try {
        const str = JSON.stringify(data)
        if (Buffer.byteLength(str, 'utf8') <= maxBytes) return data
        return str.slice(0, Math.floor(maxBytes * 0.9)) + '...[truncated]'
    } catch {
        return undefined
    }
}

const constants = {
    STATUS: {
        PENDING: 'pending',
        SUCCESS: 'success',
        ERROR: 'error'
    },
    ACTOR: {
        ADMIN: 'admin',
        USER: 'user',
        API: 'api',
        ANONYMOUS: 'anonymous'
    },
    DIRECTION: {
        IN: 'in',
        OUT: 'out'
    }
}

const logSchema = {
    action: {
        type: String,
        required: true,
        filter: true
    },
    actor: {
        type: {
            type: String,
            filter: true,
            default: constants.ACTOR.ANONYMOUS
        },
        id: {
            type: String,
            filter: true
        },
        name: {
            type: String,
            filter: true
        }
    },
    direction: {
        type: String,
        default: constants.DIRECTION.IN
    },
    appVersion: String,
    requestId: {
        type: String,
        unique: true,
        filter: true
    },
    requestTime: Date,
    responseTime: Date,
    duration: Number,
    ip: {
        type: String,
        filter: true
    },
    userAgent: { type: String },
    status: {
        type: String,
        default: constants.STATUS.PENDING,
        filter: true
    },
    data: {
        type: {},
        validate: {
            validator: function (v) {
                if (v == null) return true
                try {
                    const jsonString = JSON.stringify(v)
                    return Buffer.byteLength(jsonString, 'utf8') <= 65536
                } catch (err) {
                    return false
                }
            },
            message: 'Log data payload exceeds 64KB limit or contains circular references.'
        }
    }
}

const index = [
    [
        { createdAt: 1 },
        { expireAfterSeconds: process.env.PRODUCTION ? 3 * 24 * 60 * 60 : 60 * 60 }
    ],
    { duration: 1 }
]

const methods = Log => {
    function start(logData) {
        const requestTime = new Date
        const requestStart = performance.now()
        if (!logData.requestId)
            logData.requestId = uid(16)

        const logBody = {
            requestTime,
            appVersion,
            ...logData
        }
        const logPromise = Log.create(logBody)
        let actorData
        async function end(updateData) {
            const responseTime = new Date
            const requestEnd = performance.now()
            const duration = +(requestEnd - requestStart).toFixed(4)
            const log = await logPromise
            const update = {
                responseTime,
                duration,
                ...updateData
            }
            if (actorData)
                update.actor = actorData
            try { await Log.updateOne({ id: log.id }, update) } catch {}
        }
        async function success(responseData) {
            const update = {
                status: constants.STATUS.SUCCESS,
                ['data.response']: truncateLogData(responseData)
            }

            return end(update)
        }
        async function error(responseData) {
            const update = {
                status: constants.STATUS.ERROR,
                ['data.response']: truncateLogData(responseData)
            }
            return end(update)
        }
        function actor(data) {
            actorData = data
        }

        return {
            success,
            error,
            actor,
            end
        }
    }

    return { start }
}

export const meta = {
    index,
    constants,
    noActive: true,
    methods
}

export default logSchema