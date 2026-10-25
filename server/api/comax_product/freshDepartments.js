/**
 * Departments Comax does not stock-manage.
 *
 * These counters (produce, butcher, fish, bakery, deli, prepared food, the
 * franchise nut/frozen counters) report ~0-2% in stock, so the per-store
 * `HasInventory=1` feed drops them entirely — dept 13 returns 2 items out of
 * 1,588. They are fetched one department per call instead, without
 * `HasInventory`.
 *
 * Comax exposes no way to discover this list: `SuperDepartmentID` is ignored
 * and `DepartmentID` takes exactly one code. So the list is configuration —
 * a new counter must be added here (DB setting or env), not guessed.
 *
 * Precedence, mirroring stock.mode in server/utils/data/withStock.js:
 *   DL.Setting('comax.freshDepartments') → COMAX_FRESH_DEPARTMENTS → default
 */
export const FRESH_DEPARTMENTS_KEY = 'comax.freshDepartments'
export const FRESH_DEPARTMENTS_ENV = 'COMAX_FRESH_DEPARTMENTS'

export const DEFAULT_FRESH_DEPARTMENTS = [
    '54',   // טריה - בשר עוף        (fresh chicken/meat)
    '13',   // פירות וירקות טריים     (fresh produce)
    '52',   // פיצוחים זכיינות
    '28',   // בית המאפה             (bakery)
    '1001', // אוכל מוכן             (prepared food)
    '56',   // קפואים זכיינות
    '57',   // דגים טריים            (fresh fish)
    '1201', // זכיין - פיצוחי ענהאל
    '9',    // ירקות פירות עם מע"מ
    '29',   // מעדניה חלבית
    '1000', // נתח קצבים
    '113',  // מעדנית סלטים
    '26',   // מעדניית נקניק
    '34',   // בשר טחון קצבייה
    '112'   // מעדניה בשרית
]

/**
 * Accepts "54,13,52" / ['54','13'] / undefined and returns clean, unique,
 * numeric department codes. Anything else is ignored with a warning so a typo
 * cannot turn into a bogus API call.
 */
export function parseFreshDepartments(raw) {
    const values = Array.isArray(raw) ? raw : String(raw ?? '').split(',')
    const codes = []
    for (const value of values) {
        const code = String(value ?? '').trim()
        if (!code) continue
        if (!/^\d+$/.test(code)) {
            console.warn(`[Comax Import] Ignoring invalid fresh department code "${code}"`)
            continue
        }
        if (!codes.includes(code)) codes.push(code)
    }
    return codes
}

async function readSetting(DL) {
    if (!DL?.Setting?.readOne) return null
    try {
        const setting = await DL.Setting.readOne({ key: FRESH_DEPARTMENTS_KEY }, { _id: 0, value: 1 })
        return setting?.value ?? null
    } catch (e) {
        console.warn(`[Comax Import] Could not read ${FRESH_DEPARTMENTS_KEY}:`, e?.message || e)
        return null
    }
}

/**
 * The department codes to fetch without `HasInventory`.
 */
export async function resolveFreshDepartments(DL) {
    const setting = await readSetting(DL)
    const configured = parseFreshDepartments(setting)
    if (configured.length) return configured

    const fromEnv = parseFreshDepartments(process.env[FRESH_DEPARTMENTS_ENV])
    if (fromEnv.length) return fromEnv

    return [...DEFAULT_FRESH_DEPARTMENTS]
}
