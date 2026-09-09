import os from 'os'
import sharp from 'sharp'
import log from '#server/utils/log.js'

// VM shape differs per customer install — resolve worker concurrency at boot.
// fetchConcurrency: network-bound, VM-independent.
// cpuConcurrency: unzip + sharp saturate cores; ~100MB peak per image job.
export function resolveSizing() {
    const vCPU = Math.max(1, os.cpus().length)
    const ramMB = os.totalmem() / 1024 / 1024
    const fetchConcurrency = Number(process.env.GS1_FETCH_CONCURRENCY || 12)
    const cpuConcurrency = Number(process.env.GS1_CPU_CONCURRENCY || 0)
        || Math.max(1, Math.min(vCPU - 1, Math.floor(ramMB / 256)))
    const maxPerMinute = Number(process.env.GS1_FETCH_MAX_PER_MIN || 60)

    try {
        sharp.concurrency(Math.max(1, vCPU - 1))
    } catch {
        // sharp tuning is best-effort
    }
    if (!process.env.UV_THREADPOOLSIZE)
        process.env.UV_THREADPOOLSIZE = String(4 + cpuConcurrency)

    const sizing = { vCPU, ramMB: Math.round(ramMB), fetchConcurrency, cpuConcurrency, maxPerMinute }
    log.info(`[GS1] Sizing: ${JSON.stringify(sizing)}`)
    return sizing
}

export default { resolveSizing }
