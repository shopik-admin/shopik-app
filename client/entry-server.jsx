import { StaticRouter, matchPath } from 'react-router'
import { renderToString } from 'react-dom/server'
import Head from 'layout/Head'
import pages from './pages'
import App from './App'

export async function render({ url, data }) {
  const pathname = url.split('?')[0]
  const page = pages.find(p => matchPath(p.path, pathname))
  let notFound = !page
  data.initData = notFound ? { notFound: true } : await page.element.init?.(url)
  if (data.initData?.notFound) notFound = true
  data.url = url

  const html = renderToString(
    <StaticRouter location={url}>
      <App data={data} />
    </StaticRouter>
  )

  let head = renderToString(<Head
    title={`Shopik | ${notFound ? 'עמוד לא נמצא' : data.initData?.title || page?.title || ''}`}
    description={notFound ? '' : data.initData?.description || page?.description || ''}
    noindex={notFound}
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
