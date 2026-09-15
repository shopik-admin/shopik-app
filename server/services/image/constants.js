export const IMAGE_SIZES = {
    xl: 1000,
    l: 600,
    m: 300,
    s: 120
}

// Banners are full-bleed hero images — much larger than product thumbnails.
export const BANNER_SIZES = {
    xl: 1920,
    l: 1600,
    m: 1200,
    s: 800
}

// Complete = same source + hash written + every expected size URL present.
// Catches previously-failed / partial uploads (hash but missing sizes).
export const isMainImageComplete = (main, sourceUrl) =>
    main?.sourceUrl === sourceUrl &&
    Boolean(main?.hash) &&
    Object.keys(IMAGE_SIZES).every(k => Boolean(main?.sizes?.[k]))