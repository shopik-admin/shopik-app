/**
 * Who owns a product's main image.
 *
 * `images.product[].sourceUrl` carries a scheme that records which writer put
 * the image there: `upload://` (admin file), `gs1://` (supplier media),
 * `scrape://` (third-party probe), anything else is a Comax picUrl HTTP link.
 * Every writer must refuse to replace a main that ranks higher than what it is
 * about to write, so the bulk upload tool, GS1, the scraper and the nightly
 * Comax refill can run at the same time without stomping each other.
 *
 * Priority: upload > gs1 > scrape > Comax picUrl.
 */

export const SOURCE_UPLOAD = 'upload://'
export const SOURCE_GS1 = 'gs1://'
export const SOURCE_SCRAPE = 'scrape://'

const RANK = {
    [SOURCE_UPLOAD]: 3,
    [SOURCE_GS1]: 2,
    [SOURCE_SCRAPE]: 1
}

const scheme = sourceUrl =>
    Object.keys(RANK).find(prefix => String(sourceUrl || '').startsWith(prefix)) || 'comax'

const rankOf = sourceUrl => RANK[scheme(sourceUrl)] || 0

/** true when the current main outranks what a writer is about to store. */
export const outranks = (currentSourceUrl, candidateSourceUrl) =>
    rankOf(currentSourceUrl) > rankOf(candidateSourceUrl)

/** true when only the admin's own uploads may replace this main. */
export const isUploadMain = sourceUrl => scheme(sourceUrl) === SOURCE_UPLOAD

/** 'upload' | 'gs1' | 'scrape' | 'comax' — the label the admin report shows. */
export const sourceLabel = sourceUrl => scheme(sourceUrl).replace(/:\/\//, '') || 'comax'

export default { outranks, isUploadMain, sourceLabel, SOURCE_UPLOAD, SOURCE_GS1, SOURCE_SCRAPE }
