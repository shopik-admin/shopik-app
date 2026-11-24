import { Readable } from 'node:stream'
import sharp from 'sharp'
import resolveDomainId from '#server/utils/resolveDomainId.js'
import { getPwaIconUrl, PWA_ICON_FILES } from '#common/functions/pwaIconUrl.js'
import { getSettingFileUrl } from '#common/functions/settingFileUrl.js'

// URL variant -> the file name the upload pipeline generates (`appearance.appIcon`
// is a storage dir holding these) -> the shipped icon used when none was uploaded.
// The names ship in admin/public/icons and are copied to build/admin.
const VARIANTS = {
    '192.png': { file: PWA_ICON_FILES.icon192, fallback: '/icons/icon-192.png' },
    '512.png': { file: PWA_ICON_FILES.icon512, fallback: '/icons/icon-512.png' },
    'maskable-512.png': { file: PWA_ICON_FILES.maskable512, fallback: '/icons/maskable-512.png' },
    '180.png': { file: PWA_ICON_FILES.apple180, fallback: '/icons/apple-180.png' }
}

// Android's status-bar badge. It is fetched/rasterised here because the
// favicon setting is often an SVG on the files host, and a notification badge
// has to be a small PNG that the system can tint (it uses the alpha channel).
const BADGE = 'badge-96.png'
const BADGE_SIZE = 96
const BADGE_FALLBACK = '/icons/badge-96.png'

/**
 * The current host's app icon, served from the app origin, plus the favicon as
 * a badge PNG.
 *
 * An uploaded app icon lives on the files host, but notification images and
 * `apple-touch-icon` must resolve on the app origin — the browser/OS fetches
 * them without the page's context and cross-origin images are unreliable there.
 * The path is fixed (`:file` is an allow-listed variant), so this is a mapper,
 * not an open proxy.
 */
export default function registerAppIconRoute(app, bootData) {
    const { DL, utils } = bootData

    async function appearanceOf(req) {
        try {
            let domainId
            try {
                domainId = await resolveDomainId(req, DL)
            } catch { }
            const settings = await utils.data.getSettings({ ...bootData, domainId })
            return settings?.appearance || {}
        } catch {
            // Settings unavailable is not a reason to break the icon.
            return {}
        }
    }

    async function badge(req, res, appearance) {
        const fallback = () => res.redirect(302, BADGE_FALLBACK)
        const favicon = appearance?.favicon || ''
        if (!favicon) return fallback()

        try {
            const upstream = await fetch(getSettingFileUrl(favicon), {
                signal: AbortSignal.timeout(5000)
            })
            if (!upstream.ok) return fallback()

            const png = await sharp(Buffer.from(await upstream.arrayBuffer()), { density: 384 })
                .resize(BADGE_SIZE, BADGE_SIZE, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png()
                .toBuffer()

            res.setHeader('Content-Type', 'image/png')
            return res.send(png)
        } catch {
            // Files host down, or a favicon format sharp cannot decode (.ico):
            // the shipped bell is better than a missing status-bar icon.
            if (!res.headersSent) return fallback()
            return res.end()
        }
    }

    app.get('/icons/app/:file', async (req, res) => {
        const file = req.params.file
        if (file !== BADGE && !Object.hasOwn(VARIANTS, file)) return res.status(404).end()

        // The URL is host-relative, so caches must key on the host.
        res.setHeader('Vary', 'Host')
        res.setHeader('Cache-Control', 'public, max-age=3600')

        const appearance = await appearanceOf(req)
        if (file === BADGE) return badge(req, res, appearance)

        const variant = VARIANTS[file]
        const fallback = () => res.redirect(302, variant.fallback)
        const appIcon = appearance?.appIcon || ''
        if (!appIcon) return fallback()

        try {
            const upstream = await fetch(getPwaIconUrl(appIcon, variant.file), {
                signal: AbortSignal.timeout(5000)
            })
            if (!upstream.ok || !upstream.body) return fallback()

            res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png')
            Readable.fromWeb(upstream.body).pipe(res)
        } catch {
            if (!res.headersSent) fallback()
        }
    })
}
