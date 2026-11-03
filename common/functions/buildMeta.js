// Assemble Open Graph + Twitter card values for the SSR head (social
// crawlers read the server-rendered HTML only). Precedence per field:
// per-page content (Page.init results) > the domain's public `seo`
// settings > the route table > appearance settings.
import { getSettingFileUrl } from './settingFileUrl.js'
import { getPwaIconUrl, PWA_ICON_FILES } from './pwaIconUrl.js'

export function buildMeta({ settings, initData, page, notFound, url, host } = {}) {
    const seo = settings?.seo || {}
    const appearance = settings?.appearance || {}
    const pathname = String(url || '').split('?')[0]
    const image = notFound
        ? ''
        : (initData?.image || getPwaIconUrl(appearance.appIcon, PWA_ICON_FILES.icon512) || getSettingFileUrl(appearance.logo))
    return {
        title: notFound ? '' : (initData?.title || seo.seoTitle || page?.title || appearance.siteName || ''),
        description: notFound ? '' : (initData?.description || seo.seoDescription || page?.description || ''),
        image,
        url: host ? `https://${host}${pathname.startsWith('/') ? pathname : `/${pathname}`}` : '',
        type: notFound ? '' : (initData?.metaType || seo.ogType || 'website'),
        siteName: appearance.siteName || '',
        twitterCard: notFound ? '' : (seo.twitterCard || (image ? 'summary_large_image' : 'summary'))
    }
}
