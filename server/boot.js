import loadDir from '#common/functions/loadDir.js'
import { loadEnvFile } from 'process'
import createDL from './dl/index.js'
import { fileURLToPath } from 'url'
import path from 'path'
import externalBuilder from '#server/external/index.js'
import entityRouteConfig from '#server/utils/entityRouteConfig.js'
import { applyEntityRoutes } from '#server/utils/entityApi.js'

const
    __filename = fileURLToPath(import.meta.url),
    __dirname = path.dirname(__filename)

export default async function boot() {
    try {
        loadEnvFile()
    } catch {
        // In container/production, environment variables are passed directly
    }
    const [DL, api, utils] = await Promise.all([
        createDL(__dirname),
        loadDir(path.join(__dirname, 'api')),
        loadDir(path.join(__dirname, 'utils'))
    ])

    // Register the standard read/count/id/filters routes declared in
    // entityRouteConfig.js — file-defined handlers always win
    applyEntityRoutes(api, entityRouteConfig)

    const external = externalBuilder({
        DL,
        api,
        utils
    })

    return {
        DL,
        api,
        utils,
        external,
        validators: utils.validators
    }
}
