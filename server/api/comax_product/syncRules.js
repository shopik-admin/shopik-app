import { KASHRUT_VALID_CODES } from '#common/components/Kashrut/constants.js'
import { loadRuleLookup } from '#server/services/comaxCategorySettings/index.js'

export function buildSyncFilter() {
    return {
        active: { $ne: false },
        // Deposit products are internal: they are referenced by a parent
        // product and charged through it, never sold as a catalog item.
        isTrailingItem: { $ne: true },
        superDepartmentCode: { $exists: true, $nin: ['12', null] },
        departmentCode: { $exists: true },
        groupCode: { $exists: true }
    }
}

function statuses(DL) {
    return DL.Product.constants.STATUS
}

/**
 * The buying-price requirement is armed only once buying prices were actually
 * imported — otherwise the first deploy would archive everything. Shared with
 * the catalog report so the "reason" it shows can never disagree with the sync.
 *
 * The answer only flips false→true, so a boolean "does one exist" is enough:
 * an unindexed $gt count read the whole 23k catalog on every preview request.
 * `exists` stops at the first document with a price, and the memo keeps even
 * that to once per five minutes.
 *
 * The memo stores the in-flight promise too: a burst's first calls run
 * concurrently, and without single-flight every one of them missed the empty
 * cache and fired its own full scan (8 collscans in one stress window).
 */
const ENFORCE_BUYING_PRICE_TTL_MS = 5 * 60 * 1000
const enforceBuyingPriceCache = new WeakMap()

export async function shouldEnforceBuyingPrice(DL) {
    const now = Date.now()
    const cached = enforceBuyingPriceCache.get(DL)
    if (cached && now - cached.at < ENFORCE_BUYING_PRICE_TTL_MS)
        return 'pending' in cached ? cached.pending : cached.value

    const entry = {
        at: now,
        pending: DL.ComaxProduct.Model
            .exists({ buyingPrice: { $gt: 0 } })
            .then(found => !!found)
    }
    enforceBuyingPriceCache.set(DL, entry)
    try {
        const value = await entry.pending
        enforceBuyingPriceCache.set(DL, { at: now, value })
        return value
    } catch (error) {
        // Never cache a failed lookup: the next request retries.
        if (enforceBuyingPriceCache.get(DL) === entry) enforceBuyingPriceCache.delete(DL)
        throw error
    }
}

export async function hideActiveProduct({ DL, barcode }) {
    if (!barcode) return 0
    const { ACTIVE, HIDDEN } = statuses(DL)
    const res = await DL.Product.update(
        { barcode, status: ACTIVE },
        { status: HIDDEN }
    )
    return res?.modifiedCount || 0
}

export async function hideInactiveProducts({ DL, batchSize } = {}) {
    const BATCH = Number(batchSize || process.env.COMAX_SYNC_BATCH || 1000)
    const { ACTIVE, HIDDEN } = statuses(DL)
    const filter = { active: false, barcode: { $nin: [null, ''] } }

    let hidden = 0
    let afterBarcode = null

    // Keyset on the unique barcode, not skip: MongoDB bounds a blocking sort by
    // skip + limit, which the full catalog walks straight past (32MB limit).
    while (true) {
        const rows = await DL.ComaxProduct.read(
            afterBarcode ? { ...filter, barcode: { $gt: afterBarcode } } : filter,
            { _id: 0, barcode: 1 },
            { limit: BATCH, sort: { barcode: 1 } }
        )
        if (!rows?.length) break

        afterBarcode = rows[rows.length - 1]?.barcode

        const barcodes = rows.map(r => r.barcode).filter(Boolean)
        if (!barcodes.length) break

        const res = await DL.Product.update(
            { barcode: { $in: barcodes }, status: ACTIVE },
            { status: HIDDEN }
        )
        hidden += res?.modifiedCount || 0

        if (rows.length < BATCH) break
    }

    return hidden
}

/**
 * A product in no store cannot be sold. buildProduct already hides the rows
 * the sync visits, but a product whose Comax row disappeared (or never existed)
 * is never visited, so it would stay ACTIVE with an empty storeIds forever.
 * This sweep is the backstop: any ACTIVE product with no store becomes HIDDEN,
 * whatever its barcode or source.
 */
export async function hideStorelessProducts({ DL }) {
    const { ACTIVE, HIDDEN } = statuses(DL)
    const res = await DL.Product.update(
        { status: ACTIVE, 'storeIds.0': { $exists: false } },
        { status: HIDDEN }
    )
    return res?.modifiedCount || 0
}

async function flaggedCodes(DL, field, value) {
    const rows = await DL.CategoryMap.read(
        { [field]: value },
        { _id: 0, subGroupCode: 1 },
        { limit: 0 }
    )
    return (rows || []).map(row => String(row.subGroupCode)).filter(Boolean)
}

/**
 * Backstop for products the sync loop never visits (Comax row gone or filtered
 * out): an ACTIVE product whose mapped category was deactivated, or whose Comax
 * category setting is hidden, must not stay visible. Hide-only — nothing is
 * ever un-hidden here.
 */
export async function hideCategoryFlaggedProducts({ DL, ruleLookup = null }) {
    // Independent hide flags: the mirrored category active state and the admin's
    // category setting. Union the codes so a single update covers both.
    const hiddenSettingCodes = []
    for (const [code, rule] of ruleLookup?.bySubGroupCode || []) {
        if (rule?.hidden === true) hiddenSettingCodes.push(String(code))
    }

    const codes = [...new Set([
        ...await flaggedCodes(DL, 'categoryActive', false),
        ...hiddenSettingCodes
    ])]
    if (!codes.length) return 0
    const { ACTIVE, HIDDEN } = statuses(DL)
    const res = await DL.Product.update(
        { status: ACTIVE, comaxSubGroupCode: { $in: codes } },
        { status: HIDDEN }
    )
    return res?.modifiedCount || 0
}

/**
 * Same backstop for kashrut: an ACTIVE product in a "kashrut required" sub-group
 * without a valid rabbinate code is hidden. A product becomes visible again only
 * when the sync ladder sees a valid code (never through this sweep).
 *
 * "without a valid code" must be negated at the array level: a plain
 * `rabbinates.code: { $nin: valid }` matches when ANY element is invalid, which
 * would hide a product that also carries a valid code (and fight the ladder,
 * which passes on ANY valid code via hasValidKashrut). $not + $elemMatch means
 * "no entry has a valid code", matching products with no kashrut at all, empty
 * rabbinates, name-only entries and legacy string kashrut too.
 */
export async function hideKashrutMissingProducts({ DL, ruleLookup = null }) {
    const lookup = ruleLookup || await loadRuleLookup(DL)
    const codes = []
    for (const [code, rule] of lookup?.bySubGroupCode || []) {
        if (rule?.requireKashrut === true) codes.push(String(code))
    }
    if (!codes.length) return 0
    const { ACTIVE, HIDDEN } = statuses(DL)
    const res = await DL.Product.update(
        {
            status: ACTIVE,
            comaxSubGroupCode: { $in: codes },
            'kashrut.rabbinates': { $not: { $elemMatch: { code: { $in: [...KASHRUT_VALID_CODES] } } } }
        },
        { status: HIDDEN }
    )
    return res?.modifiedCount || 0
}
