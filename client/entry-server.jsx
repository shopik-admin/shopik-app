import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createStaticHandler, createStaticRouter, StaticRouterProvider, matchPath } from 'react-router'
import pages from 'pages'
import { routes } from './routes'

function createFetchRequest(urlStr) {
  const url = new URL(urlStr, 'http://localhost')
  return new Request(url.href, {
    method: 'GET',
  })
}

export async function render(serverData) {
  const { url } = serverData

  const handler = createStaticHandler(routes)
  const fetchReq = createFetchRequest(url)
  const context = await handler.query(fetchReq)

  if (context instanceof Response) {
    throw context
  }

  const router = createStaticRouter(handler.dataRoutes, context)

  const activePage = pages.find(page => matchPath({ path: page.path, end: true }, url))

  const title = activePage?.title || 'דף הבית'
  const description = activePage?.description || ''

  const head = `
    <title>${title}</title>
    <meta name="description" content="${description}" />
  `

  const html = ReactDOMServer.renderToString(
    <React.StrictMode>
      <StaticRouterProvider router={router} context={context} />
    </React.StrictMode>
  )

  return { html, head }
}