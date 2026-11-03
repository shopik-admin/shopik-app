// The utils loader keys by filename, so this wrapper stays for utils.normalizeDomain.
// The rules themselves live in common/functions/normalizeDomain.js, shared with the
// storefront (banner links) so both sides agree on the site's own host.
export { expandOrigins, normalizeHostname, rootHostname } from '#common/functions/normalizeDomain.js'
export { default } from '#common/functions/normalizeDomain.js'
