import allPermissions from '#server/utils/auth/permissions.js'
import pkg from '#package.json' with { type: 'json' }
import uid from '#common/functions/uid.js'

const appVersion = pkg?.version || 'unknown'

const allPermissionsHash = allPermissions.reduce((acc, curr) => {
    acc[curr] = true
    return acc
}, {})

const SENSITIVE_KEY = /otp|passw|secret|token|card|cvv|cvc|authorization/i

function redact(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 4)
        return value
    if (Array.isArray(value))
        return value.map(item => redact(item, depth + 1))
    const out = {}
    for (const [key, val] of Object.entries(value))
        out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(val, depth + 1)
    return out
}

const RELEASE_LOCK_SCRIPT = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end'

const apiRoutes = {}
function populateRoutes(api, prefix = '/') {
    for (const [key, value] of Object.entries(api)) {
        if (typeof value === 'function') {
            apiRoutes[prefix + key] = value
        } else if (typeof value === 'object') {
            populateRoutes(value, prefix + key + '/')
        }
    }
}

function validateApi() {
    for (const [key, value] of Object.entries(apiRoutes)) {
        if (value?.config?.permissions?.length) {
            let validPermissions
            if (typeof value?.config?.permissions === 'string') {
                validPermissions = allPermissionsHash[value?.config?.permissions]
            } else if (Array.isArray(value?.config?.permissions)) {
                validPermissions = value.config.permissions.every(
                    permission => allPermissionsHash[permission]
                )
            }
            if (!validPermissions)
                throw new Error(`Invalid permissions for route ${key}`)
        }
    }
}

/**
 * @param {BootData} bootData
 */
export default function router(app, bootData) {
    const { DL, api, utils } = bootData
    populateRoutes(api)
    validateApi()
    app.use('/api', async (req, res, next) => {
        const { headers, body = {}, files, ip } = req
        const platform = utils.getPlatform(req)
        const route = req.path.replace(/^\/api\/?/, '').replace(/\/$/, '')
        const apiFunction = apiRoutes[route]
        const requestId = uid(16)
        let actorId,
            actorType,
            actorName,
            requestLog,
            requestLogPromise,
            info
        try {
            if (apiFunction?.config?.log !== false) {
                const logData = {
                    requestId,
                    action: route,
                    ip,
                    userAgent: headers['user-agent'],
                    data: {
                        request: {
                            platform,
                            body: redact(body)
                        }
                    }
                }
                requestLog = DL.Log.start(logData)
            }

            if (typeof apiFunction !== 'function') {
                throw {
                    status: 404,
                    message: `Route ${route} Not Found`
                }
            }

            let _admin
            const { permissions = [], auth } = apiFunction.config || {}

            const isAdminRoute = permissions.length > 0 || platform.includes('admin')
            if (isAdminRoute && auth != 'none') {
                const adminRequired = permissions.length || auth === 'required'
                try {
                    _admin = await utils.auth.getAdmin(req, bootData)
                    actorId = _admin.id
                    actorType = DL.Log.constants.ACTOR.ADMIN
                    actorName = `${_admin.name?.first ?? ''} ${_admin.name?.last ?? ''}`
                } catch (e) {
                    if (adminRequired) throw e
                }

                if (permissions.length) {
                    let hasPermission
                    if (typeof permissions === 'string') {
                        hasPermission = _admin.hasPermission(permissions)
                    } else if (Array.isArray(permissions)) {
                        hasPermission = permissions.every(p => _admin.hasPermission(p))
                    }
                    if (!hasPermission)
                        throw { status: 403, message: 'Forbidden' }
                }
            }

            let _user
            const needsUserAuth = !permissions.length && auth != 'none'
            if (needsUserAuth) {
                try {
                    _user = await utils.auth.getUser(req, bootData)
                    actorId = _user.id
                    actorType = DL.Log.constants.ACTOR.USER
                    actorName = `${_user?.name?.first ?? ''} ${_user?.name?.last ?? ''}`
                } catch (e) {
                    if (auth != 'lax') throw e
                }
            }

            const setCookie = (name, value, exp) => {
                res.cookie(
                    name,
                    value,
                    {
                        httpOnly: true,
                        secure: process.env.PRODUCTION, // only enable in production HTTPS
                        sameSite: 'lax',                // 'strict' for higher CSRF protection
                        path: '/',
                        maxAge: exp
                    }
                )
            }

            const clearCookie = (name) => res.clearCookie(name)

            info = {
                ...bootData,
                platform,
                ip,
                headers,
                cookies: req.cookies,
                files,
                query: req.query,
                res,
                req,
                setCookie,
                clearCookie,
                _admin,
                _user,
            }

            let lockKey,
                lockAcquired = false
            if (apiFunction?.config?.preventMultiple) {
                lockKey = `lock:${route}`
                if (typeof apiFunction?.config?.preventMultiple === 'function')
                    lockKey += apiFunction?.config?.preventMultiple(body, info)
                const acquired = await DL.redis?.set(lockKey, requestId, 'NX', 'EX', 30)
                if (!acquired) {
                    throw { status: 429, message: 'Too Many Requests' }
                }
                lockAcquired = true
            }

            if (apiFunction.config?.required?.length) {
                const { required } = apiFunction.config
                const requiredIsMissing = required.filter(required => body[required] == undefined || body[required] === '')
                if (requiredIsMissing.length)
                    throw { status: 400, message: `missing required fields [${requiredIsMissing.join(', ')}]` }
            }

            const result = await apiFunction(body, info)
            if (!res.headersSent) {
                const response = {
                    requestId,
                    data: result,
                    status: 200
                }
                if (requestLog) {
                    requestLogPromise = requestLog.success({
                        ...response,
                        data: Array.isArray(result) ? `[${result.length} elements]` : redact(result)
                    })
                }
                return res.status(200).send(response)
            }
        } catch (error) {
            const status = Number(error?.status) || 500
            const message = error?.message || (typeof error === 'string' && error) || 'Internal Error'
            const errorRes = {
                requestId,
                status,
                message,
                ...(process.env.PRODUCTION || !error?.stack ? {} : {
                    stack: error.stack
                })
            }
            if (requestLog)
                requestLogPromise = requestLog.error(errorRes)

            if (!res.headersSent)
                return res.status(status).send(errorRes)
            return res.end()
        } finally {
            if (lockAcquired && lockKey) {
                try { await DL.redis?.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, requestId) } catch {}
            }
            if (requestLog) {
                if (actorId) {
                    requestLog.actor({
                        type: actorType,
                        id: actorId,
                        name: actorName
                    })
                }
                try { await requestLogPromise } catch {}
            }
        }
    })
}