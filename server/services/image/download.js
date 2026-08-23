const MAX_BYTES = 20 * 1024 * 1024

export default async function download(url, timeoutMs = 30000) {
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