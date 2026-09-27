import { OPS_PROXIMITY_RADIUS_M, OPS_STORE_AUTO_SELECT_M } from '../constants.js'
import { runtimeEnv } from './runtimeEnv.js'

// Env-overridable ops tuning. Values come from process.env on the server and
// from SSR-injected window.__ENV__ on the client (see runtimeEnv); unset keys fall
// back to common/constants.js. Number('') is 0, so `|| dflt` maps empty/missing back
// to the default.
export const opsProximityRadiusM = () => Number(runtimeEnv('OPS_PROXIMITY_RADIUS_M')) || OPS_PROXIMITY_RADIUS_M
export const opsStoreAutoSelectM = () => Number(runtimeEnv('OPS_STORE_AUTO_SELECT_M')) || OPS_STORE_AUTO_SELECT_M
