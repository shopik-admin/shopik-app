import os from 'os'
import fs from 'fs'
import sharp from 'sharp'
import log from '#server/utils/log.js'

// Container shape differs per customer install — resolve worker concurrency at boot.
//
// NOTE: os.* reports the HOST, not the container (os.totalmem() read 1024 vs a
// real 512 MiB cap on Cloud Run and we OOM'd; os.cpus() has the same flaw where
// the runtime throttles by quota instead of cpuset). So both limits are resolved
// explicitly: memory via GS1_CONTAINER_MB (512 default), CPUs via cgroup quota.
// Raise the envs when the box grows; explicit per-knob envs always win.

// cgroup v2 cpu.max: "$QUOTA $PERIOD" or "max $PERIOD" (unbounded).
// v1 fallback: cpu.cfs_quota_us / cpu.cfs_period_us (-1 = unbounded).
// Returns fractional CPUs, or null when unbounded/unknown (→ host count).
function readText(path) {
    try {
        return fs.readFileSync(path, 'utf8').trim()
    } catch {
        return null
    }
}

export function containerCpuLimit() {
    const root = process.env.GS1_CGROUP_ROOT || '/sys/fs/cgroup'
    const v2 = readText(`${root}/cpu.max`)
    if (v2) {
        const [quota, period] = v2.split(/\s+/)
        if (quota && quota !== 'max' && Number(quota) > 0 && Number(period) > 0)
            return Number(quota) / Number(period)
        return null
    }
    const quota = readText(`${root}/cpu/cpu.cfs_quota_us`)
    const period = readText(`${root}/cpu/cpu.cfs_period_us`)
    if (quota && Number(quota) > 0 && Number(period) > 0)
        return Number(quota) / Number(period)
    return null
}

export function resolveCpuCount() {
    if (Number(process.env.GS1_VCPU || 0) > 0) return Math.max(1, Math.floor(Number(process.env.GS1_VCPU)))
    const host = Math.max(1, os.cpus().length)
    const limit = containerCpuLimit()
    if (!limit) return host
    return Math.max(1, Math.min(host, Math.floor(limit)))
}
export function resolveSizing() {
    const vCPU = resolveCpuCount()
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
    // NOTE: libuv reads UV_THREADPOOL_SIZE once at process startup — setting it
    // here would be a no-op (and the old UV_THREADPOOLSIZE name was read by nothing).
    // Set UV_THREADPOOL_SIZE as a deploy-time env (Dockerfile/Cloud Run), not here.

    const sizing = { vCPU, containerMB, fetchConcurrency, cpuConcurrency, maxPerMinute }
    log.info(`[GS1] Sizing: ${JSON.stringify(sizing)}`)
    return sizing
}

export default { resolveSizing, resolveCpuCount, containerCpuLimit }
