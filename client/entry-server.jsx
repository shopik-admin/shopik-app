import { StaticRouter, matchPath } from 'react-router'
import { renderToString } from 'react-dom/server'
import Head from 'layout/Head'
import pages from './pages'
import App from './App'

const BRAND = 'Shopik'

function cleanPath(url) {
    const pathname = url.split('?')[0].split('#')[0]
    return pathname !== '/' && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

export async function render({ url, data, origin = '' }) {
  const pathname = url.split('?')[0]
  const page = pages.find(p => matchPath(p.path, pathname))
  let notFound = !page
  data.initData = notFound ? { notFound: true } : await page.element.init?.(url, { origin })
  if (data.initData?.notFound) notFound = true
  data.url = url

  const seo = notFound ? {} : (data.initData?.seo || {})
  const canonical = seo.canonical || (origin ? `${origin}${cleanPath(url)}` : undefined)
  const noindex = notFound || page.noindex || seo.noindex || false

  const html = renderToString(
    <StaticRouter location={url}>
      <App data={data} />
    </StaticRouter>
  )

  let head = renderToString(<Head
    title={`${BRAND} | ${notFound ? 'העמוד לא נמצא' : data.initData?.title || page?.title || ''}`}
    description={notFound ? '' : data.initData?.description || page?.description || ''}
    noindex={noindex}
    canonical={canonical}
    og={{
        title: data.initData?.title && `${BRAND} | ${data.initData.title}`,
        description: data.initData?.description,
        url: canonical,
        type: seo.ogType || 'website',
        image: seo.image,
        siteName: BRAND
    }}
    jsonLd={seo.jsonLd}
  />)

  const vars = Object.entries(data?.settings?.Theme || {})
    .map(([key, value]) => `--${key}:${value};`)
    .join('')

  head += `<style>:root{${vars}}</style>`

  return {
    html,
    head,
    status: notFound ? 404 : 200
  }
}
