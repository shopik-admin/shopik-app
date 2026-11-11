import { json, urlencoded } from 'express'

// Only the base64 upload/import routes legitimately carry more than a
// megabyte. Everything else gets a 1MB cap so a stray or hostile body can't
// pin 15MB of buffers per concurrent request on a 512MB box.
export const LARGE_BODY_ROUTES = new Set([
    '/api/product/upload_image',
    '/api/setting/upload_file',
    '/api/category/upload_icon',
    '/api/category/import',
    '/api/category/import_flags',
    '/api/display_block/upload_image',
    '/api/shipment/deliver'
])

export const isLargeBodyRoute = req => LARGE_BODY_ROUTES.has((req.path || '').replace(/\/+$/, ''))

/**
 * Content-type parsers with a per-route size cap. Returns
 * `[parseJson, parseUrlencoded]` so the caller can keep cookieParser between
 * them.
 */
export default function bodyParsers() {
    const smallJson = json({ limit: '1mb' })
    const largeJson = json({ limit: '15mb' })
    const smallUrlencoded = urlencoded({ extended: true, limit: '1mb' })
    const largeUrlencoded = urlencoded({ extended: true, limit: '15mb' })

    return [
        (req, res, next) => (isLargeBodyRoute(req) ? largeJson : smallJson)(req, res, next),
        (req, res, next) => (isLargeBodyRoute(req) ? largeUrlencoded : smallUrlencoded)(req, res, next)
    ]
}
