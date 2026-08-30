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

  const themeEntries = Object.entries(data?.settings?.Theme || {})
  const lightVars = []
  const darkVars = []
  for (const [key, value] of themeEntries) {
    if (value && typeof value === 'object' && !Array.isArray(value) && ('light' in value || 'dark' in value)) {
      if (value.light) lightVars.push(`--${key}:${value.light};`)
      if (value.dark) darkVars.push(`--${key}:${value.dark};`)
      else if (value.light) darkVars.push(`--${key}:${value.light};`)
    } else {
      lightVars.push(`--${key}:${value};`)
    }
  }
  const lightCss = lightVars.join('')
  const darkCss = darkVars.join('')
  head += `<style>:root{${lightCss}}${darkCss ? `:root[data-theme=dark]{${darkCss}}` : ''}</style>`

  return {
    html,
    head,
    status: notFound ? 404 : 200
  }
}
