import net from 'net'
import dns from 'dns/promises'

const MAX_BYTES = 20 * 1024 * 1024
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

function isPrivateIp(ip) {
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split('.').map(Number)
        if (a === 10 || a === 127 || a === 0) return true
        if (a === 169 && b === 254) return true
        if (a === 172 && b >= 16 && b <= 31) return true
        if (a === 192 && b === 168) return true
        if (a === 100 && b >= 64 && b <= 127) return true
        return false
    }
    const lower = ip.toLowerCase()
    if (lower === '::1' || lower === '::') return true
    if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7))
    if (/^f[cd]/.test(lower)) return true
    if (/^fe[89ab]/.test(lower)) return true
    return false
}

async function assertPublicUrl(url) {
    let parsed
    try {
        parsed = new URL(url)
    } catch {
        throw new Error('Invalid image URL')
    }
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol))
        throw new Error(`Blocked protocol: ${parsed.protocol}`)

    const hostname = parsed.hostname
    if (net.isIP(hostname)) {
        if (isPrivateIp(hostname))
            throw new Error('Blocked private address')
        return
    }

    const addrs = await dns.lookup(hostname, { all: true }).catch(() => null)
    if (!addrs?.length)
        throw new Error(`Cannot resolve image host: ${hostname}`)
    if (addrs.some(a => isPrivateIp(a.address)))
        throw new Error('Blocked private address')
}

export default async function download(url, timeoutMs = 30000) {
    await assertPublicUrl(url)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok)
            throw new Error(`Image HTTP ${res.status}: ${res.statusText}`)

        const length = Number(res.headers.get('content-length') || 0)
        if (length > MAX_BYTES)
            throw new Error(`Image too large: ${length} bytes`)

        const buffer = Buffer.from(await res.arrayBuffer())
        if (buffer.length > MAX_BYTES)
            throw new Error(`Image too large: ${buffer.length} bytes`)

        return buffer
    } finally {
        clearTimeout(timer)
    }
}
