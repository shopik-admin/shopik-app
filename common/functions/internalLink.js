import { rootHostname } from './normalizeDomain.js'

// A link belongs to the site itself when its host is the domain's storefront host.
// The www variant counts; the admin subdomain does not — banners navigate shoppers,
// not admins.
export function linkHost(link) {
    try {
        const url = new URL(String(link))
        return { url, host: url.hostname.toLowerCase().replace(/\.+$/, '') }
    } catch { return null }
}

export function isSiteLink(link, domainUrl) {
    const parsed = linkHost(link)
    if (!parsed || !domainUrl) return false
    const root = rootHostname(String(domainUrl).toLowerCase())
    return parsed.host === root || parsed.host === `www.${root}`
}

// Same-site links are stored as the in-app path (+ query and hash), so clicking one
// is a route change instead of a full document load. Anything else is kept as typed —
// including a same-site link the user wants in a new tab, since a new tab is a full
// load by definition and cannot be a route change.
export function toInternalLink(link, domainUrl, newTab = false) {
    const raw = String(link || '').trim()
    const parsed = linkHost(raw)
    if (!parsed || newTab || !isSiteLink(raw, domainUrl)) return raw
    return `${parsed.url.pathname}${parsed.url.search}${parsed.url.hash}` || '/'
}
