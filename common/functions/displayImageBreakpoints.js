// Banner art-direction rules, shared by the storefront (client/features/Display)
// and the admin editor so the fallback rule and the upload targets cannot drift.

// <picture> breakpoints. Mobile keeps the 700px rule used across the client CSS;
// tablet is the band between them.
export const BREAKPOINTS = { mobile: 700, tablet: 1024 }

// Width ladder in px, mirrored by server/services/image/constants.js BANNER_SIZES.
export const BANNER_WIDTHS = { xl: 1920, l: 1600, m: 1200, s: 800 }

export const SIZES = ['desktop', 'tablet', 'mobile']

// Slide field each size owns. `image` is the desktop slot — kept as the field name
// so existing blocks need no migration.
export const SIZE_FIELD = { desktop: 'image', tablet: 'tabletImage', mobile: 'mobileImage' }

// Field order searched when a size has no image of its own. A missing tablet falls
// back to mobile first (a phone composition crops far better into the mid band than
// a wide desktop one), and the desktop image is the universal last resort.
const FALLBACK_ORDER = {
    desktop: [SIZE_FIELD.desktop, SIZE_FIELD.tablet, SIZE_FIELD.mobile],
    tablet: [SIZE_FIELD.tablet, SIZE_FIELD.mobile, SIZE_FIELD.desktop],
    mobile: [SIZE_FIELD.mobile, SIZE_FIELD.tablet, SIZE_FIELD.desktop]
}

// Which field a size actually renders ('' when the slide has no image at all).
export function slideImageField(slide, size) {
    for (const field of FALLBACK_ORDER[size] || FALLBACK_ORDER.desktop) {
        if (slide?.[field]) return field
    }
    return ''
}

export function resolveSlideImage(slide, size) {
    const field = slideImageField(slide, size)
    return field ? slide[field] : ''
}

export const DEFAULT_RATIO = '16:10'
export const RATIO_OPTIONS = [DEFAULT_RATIO, '16:9', '4:3', '1:1', '3:4']

// '16:10' -> [16, 10]; null when unparsable (legacy blocks have no ratio).
export function parseRatio(ratio) {
    const match = String(ratio || '').match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/)
    if (!match) return null
    const width = Number(match[1]), height = Number(match[2])
    if (!width || !height) return null
    return [width, height]
}

// Upload target for one size: the ladder rung it renders at, at the block ratio.
const SIZE_WIDTH = { desktop: 'l', tablet: 'm', mobile: 's' }

export function targetDimensions(ratio, size) {
    const parsed = parseRatio(ratio)
    if (!parsed) return null
    const width = BANNER_WIDTHS[SIZE_WIDTH[size] || 'l']
    return { width, height: Math.round(width * parsed[1] / parsed[0]) }
}

// Pixel-exact ratios are rare for uploads, so match within a relative tolerance.
export function matchesRatio(width, height, ratio, tolerance = 0.005) {
    const parsed = parseRatio(ratio)
    if (!parsed || !width || !height) return false
    const target = parsed[0] / parsed[1]
    return Math.abs(width / height - target) <= target * tolerance
}
