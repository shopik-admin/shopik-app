import allPermissions from '#server/utils/auth/permissions.js'
import pkg from '#package.json' with { type: 'json' }
import uid from '#common/functions/uid.js'

const appVersion = pkg?.version || 'unknown'

const allPermissionsHash = allPermissions.reduce((acc, curr) => {
    acc[curr] = true
    return acc
}, {})

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
                            body
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

            const isAdmin = permissions.length || platform.includes('admin')
            if (isAdmin && auth != 'none') {
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
            if (!isAdmin && auth != 'none') { // figure out which requires more definitions default required / lax
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
                setCookie,
                clearCookie,
                _admin,
                _user,
            }

            if (apiFunction?.config?.preventMultiple) {
                let lockKey = `lock:${route}`
                if (typeof apiFunction?.config?.preventMultiple === 'function')
                    lockKey += apiFunction?.config?.preventMultiple(body, info)
                const lockAcquired = await DL.redis?.set(lockKey, requestId, 'NX', 'EX', 30)
                if (!lockAcquired) {
                    throw { status: 429, message: 'Too Many Requests' }
                }
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
                        data: Array.isArray(result) ? `[${result.length} elements]` : result
                    })
                }
                return res.send(response)
            }
        } catch (error) {
            const errorRes = {
                requestId,
                status: error.status || 500,
                message: error.message || error || 'Internal Error',
                ...(process.env.PRODUCTION || !error.stack ? {} : {
                    stack: error.stack
                })
            }
            if (requestLog)
                requestLogPromise = requestLog.error(errorRes)

            return res.send(errorRes)
        } finally {
            if (apiFunction?.config?.preventMultiple) {
                let lockKey = `lock:${route}`
                if (typeof apiFunction?.config?.preventMultiple === 'function')
                    lockKey += apiFunction?.config?.preventMultiple(body, info)
                await DL.redis?.del(lockKey)
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