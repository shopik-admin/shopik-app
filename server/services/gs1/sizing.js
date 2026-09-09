import os from 'os'
import sharp from 'sharp'
import log from '#server/utils/log.js'

// Container shape differs per customer install — resolve worker concurrency at boot.
//
// NOTE: os.totalmem() reports the HOST's memory, not the container's cgroup
// limit (on Cloud Run it read 1024 while the real cap was 512 MiB and we OOM'd).
// So the container limit is configured explicitly and treated as 512 for now;
// raise GS1_CONTAINER_MB when the box grows. Budgets per job come from
// the 512MB OOM: fetch ~15MB steady in flight, process ~150MB peak (unzip+sharp).
export function resolveSizing() {
    const vCPU = Math.max(1, os.cpus().length)
    const containerMB = Number(process.env.GS1_CONTAINER_MB || 512)
    const fetchConcurrency = Number(process.env.GS1_FETCH_CONCURRENCY || 0)
        || Math.max(1, Math.min(12, Math.floor(containerMB / 256)))
    const cpuConcurrency = Number(process.env.GS1_CPU_CONCURRENCY || 0)
        || Math.max(1, Math.min(vCPU - 1, Math.floor(containerMB / 256)))
    const maxPerMinute = Number(process.env.GS1_FETCH_MAX_PER_MIN || 60)

    try {
        sharp.concurrency(Math.max(1, vCPU - 1))
    } catch {
        // sharp tuning is best-effort
    }
    if (!process.env.UV_THREADPOOLSIZE)
        process.env.UV_THREADPOOLSIZE = String(4 + cpuConcurrency)

    const sizing = { vCPU, containerMB, fetchConcurrency, cpuConcurrency, maxPerMinute }
    log.info(`[GS1] Sizing: ${JSON.stringify(sizing)}`)
    return sizing
}

export default { resolveSizing }
