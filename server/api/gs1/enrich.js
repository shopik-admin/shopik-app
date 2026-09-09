import { runEnrich, runImages } from '#server/services/gs1/enrich.js'
import { initBulkFlusher } from '#server/services/gs1/bulk.js'

// POST /api/gs1/enrich {onlyInStock?, images?} — phase 2 (texts) and optionally phase 3 launch.
// Reads only the local gs1_products collection; no GS1 calls except zip downloads for images.
export default async function gs1Enrich(payload, { DL, external }) {
    initBulkFlusher(DL)
    const onlyInStock = payload?.onlyInStock ?? true
    const runId = `enrich:${Date.now()}`
    const texts = await runEnrich({ DL, external, runId, onlyInStock })
    let images = null
    if (payload?.images) {
        images = await runImages({ DL, external, runId })
    }
    return { runId, texts, images }
}

gs1Enrich.config = {
    required: [],
    permissions: ['product:update'],
    auth: 'required',
    preventMultiple: true
}
