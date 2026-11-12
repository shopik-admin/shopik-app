import { normalizeHostname } from '#server/utils/normalizeDomain.js'

// robots.txt is served BEFORE the access gate on purpose. A gated 401 here
// would leave crawlers with no instructions at all; an unconditional Allow
// lets them fetch pages and meet the 401 (or the noindex header) themselves,
// which is what actually drops a URL from the index.
//
// Never emit `Disallow` next to `noindex`: a blocked crawler cannot read the
// opt-out, so the URL stays in the index as a bare result instead of going away.
export default function registerRobotsRoute(app) {
    app.get('/robots.txt', (req, res) => {
        let host
        try {
            host = normalizeHostname(req.headers.host)
        } catch {
            // Invalid/hostless request (or a bare `localhost`): skip the sitemap
            // line rather than echoing an unvalidated Host back into the file.
            host = null
        }

        const lines = ['User-agent: *', 'Allow: /']
        if (host) lines.push('', `Sitemap: https://${host}/sitemap.xml`)
        lines.push('')

        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.setHeader('Cache-Control', 'public, max-age=300')
        res.setHeader('Vary', 'Host')
        return res.send(lines.join('\n'))
    })
}
