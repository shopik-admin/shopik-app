import sharp from 'sharp'
import download from '../download.js'
import log from '#server/utils/log.js'

export const MIN_SIDE = 900
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

// Priority order: Rami Levy first, others are fallback.
export const PROVIDER_ORDER = ['rami-levy', 'super-pharm', 'osem']

async function fetchText(url, { timeoutMs = 25000, referer = 'https://www.google.com/' } = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'he-IL,he;q=0.9', Referer: referer }
        })
        if (!res.ok) return { status: res.status, text: '' }
        return { status: res.status, finalUrl: res.url, text: await res.text() }
    } finally {
        clearTimeout(timer)
    }
}

// Rami Levy: barcode-keyed CDN, open JSON search API for traceability.
// https://img.rami-levy.co.il/product/<barcode>/large.jpg (observed 1024x1024)
function ramiLevy(barcode) {
    return [{
        site: 'rami-levy',
        sourceUrl: `https://img.rami-levy.co.il/product/${barcode}/large.jpg`,
        pageUrl: `https://www.rami-levy.co.il/api/search?q=${encodeURIComponent(barcode)}`
    }]
}

// Super-Pharm: barcode-keyed Azure blob storage. The tile rung
// (desktop/small, ~166x270) is too small — desktop/large (~580x940) passes.
function superPharm(barcode) {
    return [{
        site: 'super-pharm',
        sourceUrl: `https://superpharmstorage.blob.core.windows.net/hybris/products/desktop/large/${barcode}.jpg`,
        pageUrl: `https://shop.super-pharm.co.il/search?q=${encodeURIComponent(barcode)}`
    }]
}

// Osem-Nestle (manufacturer): no barcode-keyed URL — the packshot filename
// embeds the barcode (e.g. 6919901_<barcode>_1_Enlarge.jpg) but the numeric
// prefix is product-specific. Discovery: Drupal site search by product name
// (server-rendered brand links), then keep the first product page whose
// og:image URL or HTML mentions the barcode.
async function osem(barcode, name) {
    const candidates = []
    if (!name) return candidates
    const { text } = await fetchText(
        `https://www.osem-nestle.co.il/search/search?keys=${encodeURIComponent(name)}`,
        { referer: 'https://www.osem-nestle.co.il/' }
    ).catch(() => ({ text: '' }))
    if (!text) return candidates
    const links = [...new Set(
        [...text.matchAll(/href="(\/brands\/[^"]+)"/g)]
            .map(m => { try { return decodeURIComponent(m[1]) } catch { return m[1] } })
            .filter(p => p.split('/').filter(Boolean).length >= 3)
            .map(p => `https://www.osem-nestle.co.il${encodeURI(p)}`)
    )].slice(0, 3)
    for (const pageUrl of links) {
        const page = await fetchText(pageUrl, { referer: 'https://www.osem-nestle.co.il/' }).catch(() => null)
        if (!page?.text) continue
        const og = /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(page.text)?.[1]
        if (!og) continue
        const sourceUrl = new URL(og, pageUrl).href
        if (sourceUrl.includes(barcode) || page.text.includes(barcode))
            candidates.push({ site: 'osem', sourceUrl, pageUrl })
    }
    return candidates
}

const builders = { 'rami-levy': ramiLevy, 'super-pharm': superPharm, osem }

// Download + sharp-verify. Reuses the pipeline downloader (20MB cap).
// One retry on 429/503 (CDN throttle) after a short backoff — a throttle
// is "unknown", not a miss.
// Returns the first candidate with width>=MIN_SIDE or height>=MIN_SIDE.
export async function findCandidate(barcode, { name = '', order = PROVIDER_ORDER } = {}) {
    const tried = []
    for (const site of order) {
        const built = await builders[site](barcode, name)
        for (const cand of built) {
            let meta = null
            let error = ''
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const buffer = await download(cand.sourceUrl)
                    meta = await sharp(buffer).metadata()
                    break
                } catch (e) {
                    error = e?.message || String(e)
                    if (/HTTP 429|HTTP 503/.test(error) && attempt === 0) {
                        await new Promise(r => setTimeout(r, 8000))
                        continue
                    }
                    break
                }
            }
            const pass = (meta?.width || 0) >= MIN_SIDE || (meta?.height || 0) >= MIN_SIDE
            tried.push({ ...cand, width: meta?.width || 0, height: meta?.height || 0, pass, error })
            if (pass) {
                log.success(`[Scrape] ${barcode} ← ${cand.site} ${meta.width}x${meta.height} ${cand.sourceUrl}`)
                return { candidate: { ...cand, width: meta.width, height: meta.height }, tried }
            }
            log.info(`[Scrape] ${barcode} ✗ ${cand.site} ${meta ? `${meta.width}x${meta.height}` : error}`)
        }
    }
    return { candidate: null, tried }
}
