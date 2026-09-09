// Runtime env injected via SSR (window.__ENV__, sourced from server process.env
// in getAdminData/getClientData), with a build-time fallback (Vite `define`).
// Prefer this over bare CARTO_KEY / VITE_FILES_BASE_URL globals so production
// works even when the key was missing at `vite build` time.
export function runtimeEnv(key, baked = '') {
    try {
        if (typeof window !== 'undefined' && window.__ENV__?.[key]) return window.__ENV__[key]
    } catch { }
    try {
        if (typeof window !== 'undefined' && window.__SD__?.env?.[key]) return window.__SD__.env[key]
    } catch { }
    return baked || ''
}
