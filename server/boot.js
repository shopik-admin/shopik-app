import loadDir from '#common/functions/loadDir.js'
import { loadEnvFile } from 'process'
import { EventEmitter } from 'events'
import createDL from './dl/index.js'
import { fileURLToPath } from 'url'
import path from 'path'
import externalBuilder from '#server/external/index.js'

// @google-cloud/storage layers ~11 error/close listeners on a single body stream
// per download (node-fetch pump + teeny-request pipeline + storage pipeline).
// Reproduced locally: fires in normal sequential operation, plateaus, no growth
// across 40+ ops — benign lib noise, not a leak. Raise the tripwire (kept low so
// a real runaway still stands out) instead of touching lib internals.
EventEmitter.defaultMaxListeners = 20

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
