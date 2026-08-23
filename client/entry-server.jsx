import { StaticRouter, matchPath } from 'react-router'
import { renderToString } from 'react-dom/server'
import Head from 'layout/Head'
import pages from './pages'
import App from './App'

export async function render({ url, data }) {
  const
    page = pages.find(p => matchPath(p.path, url)) ?? pages[0]
  data.initData = await page.element.init?.(url)
  data.url = url

  const html = renderToString(
    <StaticRouter location={url}>
      <App data={data} />
    </StaticRouter>
  )

  let head = renderToString(<Head
    title={`Shopik | ${data.initData?.title || page?.title || ''}`}
    description={data.initData?.description || page?.description || ''}
  />)

  const vars = Object.entries(data?.settings?.Theme || {})
    .map(([key, value]) => `--${key}:${value};`)
    .join('')

  head += `<style>:root{${vars}}</style>`

  return {
    html,
    head
  }
}
