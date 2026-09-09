import log from '#server/utils/log.js'

// One-line RSS snapshots at pipeline choke points. arrayBuffers/heapExternal
// expose native allocations (unzip output, sharp buffers); rss is what Cloud Run kills on.
export function mem(tag) {
    const m = process.memoryUsage()
    const mb = b => Math.round(b / 1024 / 1024)
    log.info(`[GS1][mem] ${tag} rss=${mb(m.rss)} heap=${mb(m.heapUsed)}/${mb(m.heapTotal)} ext=${mb(m.external)} buffers=${mb(m.arrayBuffers)}`)
}

export default { mem }
