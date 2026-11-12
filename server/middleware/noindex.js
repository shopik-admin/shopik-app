// Crawler opt-out for deployments that must not be indexed (the test env).
// Deliberately independent of the password gate: the gate decides who gets in,
// this decides what search engines may keep. Coupling them would mean that
// unsetting one variable both opens the site and makes it indexable.
export const NOINDEX_VALUE = 'noindex, nofollow, noarchive'

export default function setupNoindex(app, { enabled = process.env.NOINDEX } = {}) {
    if (!enabled) return
    app.use((req, res, next) => {
        res.setHeader('X-Robots-Tag', NOINDEX_VALUE)
        next()
    })
}
