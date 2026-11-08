// Kashrut stamps: GS1 Rabbinate codes mapped to the store's certificate
// priority table (top = strongest). Codes in a group share one stamp image,
// named after the group's first code (see ./images and getKashrutImage).
//
// Unlisted codes sort after these (strength unknown) and fall back to their
// GS1 display name. Ordering/image slugs can be adjusted here in one place.

export const KASHRUT_RABBINATES = [
    { rank: 1, name: 'בד"ץ העדה החרדית ירושלים', codes: ['67085', '67245', '67075', '67068', '67086', '67073', '67170'] },
    { rank: 2, name: 'הרב לנדא – בני ברק', codes: ['67056', '67178', '67026'] },
    { rank: 3, name: 'בד"ץ שארית ישראל', codes: ['67160', '67060'] },
    { rank: 4, name: 'כשרות מהדרין של הרב אפרתי', codes: ['67251', '67119'] },
    { rank: 5, name: 'בד"ץ מהדרין – הרב אברהם רובין', codes: ['67016'] },
    { rank: 6, name: 'בד"ץ קהילות', codes: ['67238'] },
    { rank: 7, name: 'בד"ץ איגוד רבנים', codes: ['67096', '67146', '67193', '67258', '67039'] },
    { rank: 8, name: 'בד"ץ מחזיקי הדת – בעלזא', codes: ['67072', '67092'] },
    { rank: 9, name: 'בד"ץ יורה דעה – הרב שלמה מחפוד', codes: ['67007', '67024', '67209'] },
    { rank: 10, name: 'בד"ץ בית יוסף', codes: ['67093', '67061', '67019'] },
    { rank: 11, name: 'בד"ץ חוג חתם סופר בני ברק', codes: ['67163', '67159'] },
    { rank: 12, name: 'בד"ץ חוג חתם סופר פתח תקווה', codes: ['67110'] },
    { rank: 13, name: 'בד"ץ מאור הכשרות', codes: ['67171', '67250', '67252'] },
    { rank: 14, name: 'הרב ויטמן', codes: ['67001', '67038', '67205', '67036'] },
    { rank: 15, name: 'בד"ץ אגודת ישראל', codes: ['67076'] },
    { rank: 16, name: 'עטרה', codes: ['67128'] },
    { rank: 17, name: 'צרפת עדת יראים (פרווה)', codes: ['67134'] },
    { rank: 18, name: 'בד"ץ זכרון יעקב', codes: ['67089'] },
    { rank: 19, name: 'בד"ץ חרדים - סן פאולו', codes: ['67222'] },
    { rank: 20, name: 'בד"ץ תפארת אנש', codes: ['55003'] },
    { rank: 21, name: 'הרב בעלינוב מילאנו', codes: ['67247', '67033', '67030'] },
    { rank: 22, name: 'בד"ץ מילאנו - הרב אברהם חזן', codes: ['67104', '67000', '67053'] },
    { rank: 23, name: 'בהשגחת כ-K', codes: ['67268'] },
    { rank: 24, name: 'בהשגחת OK', codes: ['67249', '67044', '67113', '67198'] },
    { rank: 25, name: 'הרב ביסטריצקי', codes: ['55004'] },
    { rank: 26, name: 'KF לונדון', codes: ['67199', '67226', '67154', '67179', '67115'] },
    { rank: 27, name: 'KLBD לונדון', codes: ['67256', '67084', '67135'] },
    { rank: 28, name: 'ברזיל DDK בהשגחת בד"ץ', codes: ['67059'] },
    { rank: 29, name: 'בד"ץ מחזיקי הדת', codes: ['67094', '67195'] },
    { rank: 30, name: 'הרב א.ד. אוירבך', codes: ['67051', '67173'] },
    { rank: 31, name: 'הרב אהרון לוצי דקק פאדווא - איטליה', codes: ['67188'] },
    { rank: 32, name: 'קהילות החרדים בארהב', codes: ['67187', '67192'] },
    { rank: 33, name: 'בד"ץ יראים', codes: ['55008'] },
    { rank: 34, name: 'בד"ץ הרב בעדני', codes: ['55009'] },
    { rank: 35, name: 'OU', codes: ['67155', '67267', '67184', '67220'] },
    { rank: 36, name: 'בד"ץ אור החיים', codes: ['55001'] },
    { rank: 37, name: 'בד"ץ נווה ציון', codes: ['55002'] },
    { rank: 38, name: 'מהודר עוף ירושלים', codes: ['55005'] },
    { rank: 39, name: 'הרב מוצפי', codes: ['55006'] },
    { rank: 40, name: 'משולש K', codes: ['67079', '67118', '67180'] },
    { rank: 41, name: 'סטאר K ארהב (פרווה)', codes: ['67174'] },
    { rank: 42, name: 'דליקטסו - נחלת הר חבד', codes: ['55007'] }
]

// Kosher_Supervision_Type codes → Hebrew food-category label. NOT_RELEVANT
// (180) is intentionally not displayed anywhere.
export const SUPERVISION_NOT_RELEVANT = '180'

export const SUPERVISION_LABELS = {
    183: 'פרווה',
    182: 'חלבי',
    181: 'בשרי',
    184: 'לא כשר',
    180: 'לא רלוונטי'
}

// code → { rank, name, stampCode }
export const KASHRUT_CODE_INDEX = (() => {
    const index = new Map()
    for (const group of KASHRUT_RABBINATES) {
        const stampCode = group.codes[0]
        for (const code of group.codes)
            index.set(String(code), { rank: group.rank, name: group.name, stampCode })
    }
    return index
})()

// Normalize a product.kashrut value. Legacy products stored a plain string, so
// anything other than the expected object shape yields an empty, safe value.
export function normalizeKashrut(kashrut) {
    if (!kashrut || typeof kashrut !== 'object' || Array.isArray(kashrut))
        return { rabbinates: [], supervisionType: '' }
    return {
        rabbinates: Array.isArray(kashrut.rabbinates) ? kashrut.rabbinates : [],
        supervisionType: kashrut.supervisionType ? String(kashrut.supervisionType) : ''
    }
}

// Union of two rabbinates lists, deduped by code (name-only entries dedupe by
// name, same key rule as the GS1 mapper). Existing entries keep their order and
// their stored name; only codes that are missing get appended, with the canonical
// name from KASHRUT_CODE_INDEX when the addition carries none. Additions never
// drop what is already stored — neither a manual kashrut load nor the GS1 enrich.
export function mergeRabbinates(existing, additions) {
    const merged = []
    const seen = new Set()
    const push = raw => {
        const code = raw?.code != null ? String(raw.code).trim() : ''
        const name = raw?.name != null ? String(raw.name).trim() : ''
        if (!code && !name) return
        const key = code || `name:${name}`
        if (seen.has(key)) return
        seen.add(key)
        merged.push(code
            ? { code, name: name || KASHRUT_CODE_INDEX.get(code)?.name || '' }
            : { name })
    }
    for (const raw of (Array.isArray(existing) ? existing : [])) push(raw)
    for (const raw of (Array.isArray(additions) ? additions : [])) push(raw)
    return merged
}

// Sorted stamp entries for display, strongest first. Unknown codes sort last
// (stable by source order). `hasImage(stampCode)` optionally restricts the
// result to entries backed by an image; pass no predicate to keep every entry.
export function selectKashrutStamps(kashrut, count = 1, { hasImage } = {}) {
    const { rabbinates } = normalizeKashrut(kashrut)
    const seen = new Set()
    const entries = []

    rabbinates.forEach((raw, i) => {
        const code = raw?.code != null ? String(raw.code).trim() : ''
        if (!code || seen.has(code)) return
        seen.add(code)
        const known = KASHRUT_CODE_INDEX.get(code)
        const rawName = raw?.name != null ? String(raw.name).trim() : ''
        const name = rawName || known?.name || ''
        if (!name && !known) return
        entries.push({
            code,
            name,
            rank: known?.rank ?? Infinity,
            stampCode: known?.stampCode || code,
            order: i
        })
    })

    entries.sort((a, b) => (a.rank - b.rank) || (a.order - b.order))
    const filtered = hasImage ? entries.filter(e => hasImage(e.stampCode)) : entries
    const limit = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : filtered.length
    return filtered.slice(0, limit)
}

export function getSupervisionLabel(kashrut) {
    const { supervisionType } = normalizeKashrut(kashrut)
    if (!supervisionType || supervisionType === SUPERVISION_NOT_RELEVANT) return ''
    return SUPERVISION_LABELS[supervisionType] || ''
}

export default { KASHRUT_RABBINATES, SUPERVISION_LABELS, mergeRabbinates, selectKashrutStamps, getSupervisionLabel }
