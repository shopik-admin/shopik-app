import { Readable } from 'node:stream'
import resolveDomainId from '#server/utils/resolveDomainId.js'
import { getPwaIconUrl, PWA_ICON_FILES } from '#common/functions/pwaIconUrl.js'

// URL variant -> the file name the upload pipeline generates (`appearance.appIcon`
// is a storage dir holding these) -> the shipped icon used when none was uploaded.
// The names ship in admin/public/icons and are copied to build/admin.
const VARIANTS = {
    '192.png': { file: PWA_ICON_FILES.icon192, fallback: '/icons/icon-192.png' },
    '512.png': { file: PWA_ICON_FILES.icon512, fallback: '/icons/icon-512.png' },
    'maskable-512.png': { file: PWA_ICON_FILES.maskable512, fallback: '/icons/maskable-512.png' },
    '180.png': { file: PWA_ICON_FILES.apple180, fallback: '/icons/apple-180.png' }
}

/**
 * The current host's app icon, served from the app origin.
 *
 * An uploaded app icon lives on the files host, but notification icons (the
 * Android large icon) and `apple-touch-icon` must resolve on the app origin —
 * the browser/OS fetches them without the page's context and cross-origin
 * images are unreliable there. The path is fixed (`:file` is an allow-listed
 * variant), so this is a mapper, not an open proxy.
 */
export default function registerAppIconRoute(app, bootData) {
    const { DL, utils } = bootData

    app.get('/icons/app/:file', async (req, res) => {
        const file = req.params.file
        if (!Object.hasOwn(VARIANTS, file)) return res.status(404).end()
        const variant = VARIANTS[file]

        // The URL is host-relative, so caches must key on the host.
        res.setHeader('Vary', 'Host')
        res.setHeader('Cache-Control', 'public, max-age=3600')
        const fallback = () => res.redirect(302, variant.fallback)

        let appIcon = ''
        try {
            let domainId
            try {
                domainId = await resolveDomainId(req, DL)
            } catch { }
            const settings = await utils.data.getSettings({ ...bootData, domainId })
            appIcon = settings?.appearance?.appIcon || ''
        } catch { }

        if (!appIcon) return fallback()

        try {
            const upstream = await fetch(getPwaIconUrl(appIcon, variant.file), {
                signal: AbortSignal.timeout(5000)
            })
            if (!upstream.ok || !upstream.body) return fallback()

            res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png')
            Readable.fromWeb(upstream.body).pipe(res)
        } catch {
            // Files host down or slow: the shipped icon is better than a broken
            // notification icon.
            if (!res.headersSent) fallback()
        }
    })
}
