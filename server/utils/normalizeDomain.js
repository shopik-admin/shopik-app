const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

export function normalizeHostname(input) {
    if (input == null) return null
    let h = String(input).trim().toLowerCase()
    if (!h) return null
    h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    h = h.split(/[/?#]/)[0]
    h = h.split('@').pop()
    h = h.split(':')[0].replace(/\.+$/, '')
    if (!HOSTNAME_RE.test(h)) throw { status: 400, message: `invalid domain url [${input}]` }
    return h
}

export function rootHostname(hostname) {
    let h = hostname
    for (const prefix of ['www.admin.', 'admin.', 'www.']) {
        if (h.startsWith(prefix)) {
            h = h.slice(prefix.length)
            break
        }
    }
    return h
}

export function expandOrigins(hostname) {
    const root = rootHostname(hostname)
    const hosts = [root, `www.${root}`, `admin.${root}`, `www.admin.${root}`]
    return hosts.flatMap((host) => [`https://${host}`, `http://${host}`])
}

export default function normalizeDomain(input) {
    const host = normalizeHostname(input)
    if (!host) return null
    return rootHostname(host)
}
