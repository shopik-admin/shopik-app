import { normalizeHostname, rootHostname } from './normalizeDomain.js'

// Resolves the domain id for storefront traffic:
// 1. Origin/Referer hostname (same normalize logic as the CORS allowlist) → Domain.url
// 2. The request Host header — bot traffic (social crawlers, curl) sends no
//    Origin/Referer, so the host is the only tenant signal it provides.
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

function rootFromSource(source) {
    let host = String(source).trim().toLowerCase()
    host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    host = host.split(/[/?#]/)[0]
    host = host.split('@').pop()
    host = host.split(':')[0].replace(/\.+$/, '')
    return rootHostname(normalizeHostname(host))
}

async function cachedRootId(root, DL) {
    const cached = urlCache.get(root)
    if (cached && cached.expiresAt > Date.now()) return cached.id || null
    const found = await DL.Domain.readOne({ url: root, active: true }, { _id: 0, id: 1 })
    const id = found?.id || null
    urlCache.set(root, { id, expiresAt: Date.now() + TTL_MS })
    return id
}

export default async function resolveDomainId(req, DL) {
    for (const source of [req?.headers?.origin, req?.headers?.referer, req?.headers?.host]) {
        if (!source) continue
        try {
            const id = await cachedRootId(rootFromSource(source), DL)
            if (id) return id
        } catch {
            // invalid/unresolvable source — fall through to the next one
        }
    }

    if (cachedDefaultId && Date.now() < defaultExpiresAt) return cachedDefaultId
    const def = await DL.Domain.readOne({ isDefault: true, active: true }, { _id: 0, id: 1 })
    if (!def?.id) throw { status: 500, message: 'no default domain configured' }
    cachedDefaultId = def.id
    defaultExpiresAt = Date.now() + TTL_MS
    return def.id
}
