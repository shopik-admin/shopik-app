import { normalizeHostname, rootHostname } from './normalizeDomain.js'

// Resolves the domain id for storefront traffic:
// 1. Origin/Referer hostname (same normalize logic as the CORS allowlist) → Domain.url
// 2. Host header (covers server-to-server requests such as /manifest.json
//    that carry no Origin/Referer)
// 3. The single isDefault domain
// Throws when none resolves — there is no magic 'default' id anymore.
const TTL_MS = 60_000
let cachedDefaultId = null
let defaultExpiresAt = 0
const urlCache = new Map() // root hostname -> { id|null, expiresAt }

export function clearDomainCache() {
    cachedDefaultId = null
    defaultExpiresAt = 0
    urlCache.clear()
}

function rootFromOrigin(origin) {
    let host = String(origin).trim().toLowerCase()
    host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    host = host.split(/[/?#]/)[0]
    host = host.split('@').pop()
    host = host.split(':')[0].replace(/\.+$/, '')
    return rootHostname(normalizeHostname(host))
}

function candidateRoots(req) {
    const roots = []
    for (const raw of [req?.headers?.origin, req?.headers?.referer, req?.headers?.host]) {
        if (!raw) continue
        try {
            const root = rootFromOrigin(raw)
            if (root && !roots.includes(root)) roots.push(root)
        } catch {
            // invalid/unresolvable host — try the next candidate
        }
    }
    return roots
}

export default async function resolveDomainId(req, DL) {
    for (const root of candidateRoots(req)) {
        const cached = urlCache.get(root)
        if (cached && cached.expiresAt > Date.now()) {
            if (cached.id) return cached.id
            continue
        }
        const found = await DL.Domain.readOne({ url: root, active: true }, { _id: 0, id: 1 })
        urlCache.set(root, { id: found?.id || null, expiresAt: Date.now() + TTL_MS })
        if (found?.id) return found.id
    }

    if (cachedDefaultId && Date.now() < defaultExpiresAt) return cachedDefaultId
    const def = await DL.Domain.readOne({ isDefault: true, active: true }, { _id: 0, id: 1 })
    if (!def?.id) throw { status: 500, message: 'no default domain configured' }
    cachedDefaultId = def.id
    defaultExpiresAt = Date.now() + TTL_MS
    return def.id
}
