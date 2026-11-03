import resolveDomainId from '#server/utils/resolveDomainId.js'
import { getPwaIconUrl, PWA_ICON_FILES } from '#common/functions/pwaIconUrl.js'

const DEFAULT_THEME_COLOR = '#195855'
const DEFAULT_BG_COLOR = '#ffffff'

// Icons shipped in client/public/icons and admin/public/icons. They keep the
// app installable before an admin uploads a custom appIcon.
const DEFAULT_ICONS = [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
]

// Theme settings are stored either as plain strings (seedMenuColors) or as
// { light, dark } objects. Only the light value is meaningful for a manifest.
function colorOf(value, fallback) {
    const color = typeof value === 'string' ? value : value?.light
    return typeof color === 'string' && color.trim() ? color.trim() : fallback
}

function buildIcons(appIcon) {
    if (!appIcon) return DEFAULT_ICONS
    return [
        {
            src: getPwaIconUrl(appIcon, PWA_ICON_FILES.icon192),
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
        },
        {
            src: getPwaIconUrl(appIcon, PWA_ICON_FILES.icon512),
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
        },
        {
            src: getPwaIconUrl(appIcon, PWA_ICON_FILES.maskable512),
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
        }
    ]
}

export function buildManifest({ isAdmin = false, settings = {} } = {}) {
    const appearance = settings?.appearance || {}
    const theme = settings?.theme || {}

    const brand = String(appearance.siteName || '').trim() || 'Shopik'
    const siteName = isAdmin ? `${brand} Admin` : brand
    const shortName = Array.from(siteName).slice(0, 12).join('')

    const themeColor = colorOf(
        theme['header-bg'],
        colorOf(theme['product-button-bg'], DEFAULT_THEME_COLOR)
    )
    const bgColor = colorOf(theme['bg-primary'], DEFAULT_BG_COLOR)

    const manifest = {
        id: '/',
        name: siteName,
        short_name: shortName,
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        // The admin is a desktop-oriented back office; never lock its rotation.
        orientation: isAdmin ? 'any' : 'portrait-primary',
        background_color: bgColor,
        theme_color: themeColor,
        lang: 'he',
        dir: 'rtl',
        prefer_related_applications: false,
        icons: buildIcons(appearance.appIcon)
    }

    if (!isAdmin) {
        manifest.categories = ['shopping']
        manifest.shortcuts = [
            {
                name: 'הזמנות',
                short_name: 'הזמנות',
                url: '/account/orders'
            }
        ]
    }

    return manifest
}

export default function registerManifestRoute(app, bootData) {
    const { DL, utils } = bootData

    app.get('/manifest.json', async (req, res) => {
        const host = String(req.headers.host || '')
        const isAdmin = host.startsWith('admin.')

        // The manifest URL is origin-relative, so responses differ per host.
        res.setHeader('Vary', 'Host')
        res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')

        let manifest
        try {
            let domainId
            try {
                domainId = await resolveDomainId(req, DL)
            } catch { }

            const settings = await utils.data.getSettings({ ...bootData, domainId })
            manifest = buildManifest({ isAdmin, settings })
        } catch (err) {
            // Never 500 on the manifest: an unreadable setting must not make
            // the app uninstallable. Fall back to defaults instead.
            console.error('Manifest route error:', err)
            manifest = buildManifest({ isAdmin })
        }

        return res.json(manifest)
    })
}
