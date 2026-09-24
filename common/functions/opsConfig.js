import {
    OPS_PROXIMITY_RADIUS_M,
    OPS_STORE_AUTO_SELECT_M,
    OPS_LOCATION_THROTTLE_MS,
    OPS_LOCATION_MIN_MOVE_M
} from '../constants.js'
import { runtimeEnv } from './runtimeEnv.js'

// Env-overridable ops tuning. Values come from process.env on the server and
// from SSR-injected window.__ENV__ on the client (see runtimeEnv); unset keys
// fall back to common/constants.js. NOTE: env values are strings and
// Number('') === 0, so empty/missing must map to the default explicitly.
function num(key, dflt) {
    const v = runtimeEnv(key, '')
    if (v === '' || v == null) return dflt
    const n = Number(v)
    return Number.isFinite(n) ? n : dflt
}

export const opsProximityRadiusM = () => num('OPS_PROXIMITY_RADIUS_M', OPS_PROXIMITY_RADIUS_M)
export const opsStoreAutoSelectM = () => num('OPS_STORE_AUTO_SELECT_M', OPS_STORE_AUTO_SELECT_M)
export const opsLocationThrottleMs = () => num('OPS_LOCATION_THROTTLE_MS', OPS_LOCATION_THROTTLE_MS)
export const opsLocationMinMoveM = () => num('OPS_LOCATION_MIN_MOVE_M', OPS_LOCATION_MIN_MOVE_M)
