import { BANNER_WIDTHS } from '#common/functions/displayImageBreakpoints.js'

export const IMAGE_SIZES = {
    xl: 1000,
    l: 600,
    m: 300,
    s: 120
}

// Banners are full-bleed hero images — much larger than product thumbnails.
// Shared with common/functions/displayImageBreakpoints.js, which is where the
// admin helper text derives its target dimensions from.
export const BANNER_SIZES = BANNER_WIDTHS

// Complete = same source + hash written + every expected size URL present.
// Catches previously-failed / partial uploads (hash but missing sizes).
export const isMainImageComplete = (main, sourceUrl) =>
    main?.sourceUrl === sourceUrl &&
    Boolean(main?.hash) &&
    Object.keys(IMAGE_SIZES).every(k => Boolean(main?.sizes?.[k]))