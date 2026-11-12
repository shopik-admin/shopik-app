import toSlug from '#common/functions/toSlug.js'

export const EXPECTED_HEADER = [
    'שם מחלקת על',
    'מחלקת על',
    'שם מחלקה',
    'מחלקה',
    'שם קבוצה',
    'קבוצה',
    'שם',
    'קוד',
    'רמה 1 באתר',
    'קוד רמה 1',
    'רמה 2 באתר',
    'קוד רמה 2',
    'רמה 3 באתר',
    'קוד רמה 3'
]

// Column indexes in the category-map CSV.
const COL = {
    SUPER_DEPARTMENT: 0,
    SUPER_DEPARTMENT_CODE: 1,
    DEPARTMENT: 2,
    DEPARTMENT_CODE: 3,
    GROUP: 4,
    GROUP_CODE: 5,
    SUB_GROUP: 6,
    SUB_GROUP_CODE: 7,
    L1: 8,
    L1_CODE: 9,
    L2: 10,
    L2_CODE: 11,
    L3: 12,
    L3_CODE: 13
}

export function categoryIdFor(codes) {
    return `nc:${codes.filter(Boolean).join(':')}`
}

/**
 * Parse a CSV file into rows. Handles quoted fields, escaped quotes, CRLF and
 * quoted line breaks — the category file contains names with commas.
 */
export function parseCsvRows(text = '') {
    const source = String(text).replace(/^\uFEFF/, '')
    const rows = []
    let row = []
    let field = ''
    let quoted = false

    for (let i = 0; i < source.length; i++) {
        const char = source[i]
        if (quoted) {
            if (char === '"') {
                if (source[i + 1] === '"') {
                    field += '"'
                    i++
                } else quoted = false
            } else field += char
            continue
        }

        if (char === '"') quoted = true
        else if (char === ',') {
            row.push(field)
            field = ''
        } else if (char === '\n') {
            row.push(field)
            rows.push(row)
            row = []
            field = ''
        } else if (char !== '\r') field += char
    }

    if (field.length || row.length) {
        row.push(field)
        rows.push(row)
    }

    return rows.filter(row => row.some(value => String(value ?? '').trim() !== ''))
}

function normalizeHeader(row) {
    return (row || []).map(value => String(value ?? '').replace(/^\uFEFF/, '').trim())
}

function validateHeader(header) {
    const expectedIndexes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    const wrong = expectedIndexes.filter(index => header[index] !== EXPECTED_HEADER[index])
    if (wrong.length)
        throw {
            status: 400,
            message: `invalid category CSV header (missing ${wrong.map(i => EXPECTED_HEADER[i]).join(', ')})`
        }
}

/**
 * Slug for a category name, kept unique inside `used` (the set of slugs already
 * taken by its siblings, which gains the returned slug). A collision gets the
 * category code appended, then a counter. Shared with the rename endpoint so a
 * renamed category gets exactly the slug a CSV import would have given it.
 */
export function categorySlug(name, code, used) {
    const base = toSlug(name) || `cat-${code}`
    let candidate = base
    if (used.has(candidate)) candidate = `${base}-${code}`
    let suffix = 2
    while (used.has(candidate)) candidate = `${base}-${code}-${suffix++}`
    used.add(candidate)
    return candidate
}

/**
 * Build the category tree + sub-group map from the CSV text.
 *
 * Codes are unique across the whole tree by design: the admin requires it and
 * the deterministic id (nc:<l1>[:<l2>[:<l3>]]) would otherwise be ambiguous.
 */
export function buildCategoryPlan(csvText) {
    const rows = parseCsvRows(csvText)
    if (rows.length < 2)
        throw { status: 400, message: 'category CSV is empty' }

    const header = normalizeHeader(rows[0])
    validateHeader(header)

    const categoriesById = new Map()
    const codeOwner = new Map()
    const childOrder = new Map()
    const slugsByParent = new Map()
    const mapByCode = new Map()
    const counts = { l1: 0, l2: 0, l3: 0 }

    function uniqueSlug(parentId, name, code) {
        const key = parentId || 'root'
        if (!slugsByParent.has(key)) slugsByParent.set(key, new Set())
        const used = slugsByParent.get(key)
        const base = toSlug(name) || `cat-${code}`
        let candidate = base
        if (used.has(candidate)) candidate = `${base}-${code}`
        let suffix = 2
        while (used.has(candidate)) candidate = `${base}-${code}-${suffix++}`
        used.add(candidate)
        return candidate
    }

    function ensureNode({ level, code, name, parent, pathCodes }) {
        const id = categoryIdFor(pathCodes)
        const existing = categoriesById.get(id)
        if (existing) return existing

        const owner = codeOwner.get(code)
        if (owner && owner !== id)
            throw { status: 400, message: `duplicate category code ${code} (${name})` }
        codeOwner.set(code, id)

        const key = parent?.id || 'root'
        const order = childOrder.get(key) || 0
        childOrder.set(key, order + 1)

        const slug = uniqueSlug(parent?.id, name, code)
        const node = {
            id,
            code,
            name,
            level,
            slug,
            path: parent ? `${parent.path}/${slug}` : slug,
            parentId: parent?.id ?? null,
            parentIds: parent ? [...parent.parentIds, parent.id] : [],
            sortOrder: order
        }
        categoriesById.set(id, node)
        counts[`l${level}`]++
        return node
    }

    for (const row of rows.slice(1)) {
        const value = index => String(row[index] ?? '').trim()
        const subGroupCode = value(COL.SUB_GROUP_CODE)

        const l1Code = value(COL.L1_CODE)
        const l1Name = value(COL.L1)
        const l2Code = value(COL.L2_CODE)
        const l2Name = value(COL.L2)
        const l3Code = value(COL.L3_CODE)
        const l3Name = value(COL.L3)

        // A row with site columns but no sub-group code defines a category that
        // has nothing mapped to it yet — the export emits those so an empty
        // category survives a re-import instead of being deleted.
        const hasSiteColumns = [l1Code, l1Name, l2Code, l2Name, l3Code, l3Name].some(Boolean)
        if (!subGroupCode && !hasSiteColumns) continue

        const rowLabel = subGroupCode ? ` for sub-group ${subGroupCode}` : ''
        if (!l1Code || !l1Name)
            throw { status: 400, message: `missing level 1 category${rowLabel}` }
        if (!l2Code || !l2Name)
            throw { status: 400, message: `missing level 2 category${rowLabel}` }
        if (l3Name && !l3Code)
            throw { status: 400, message: `missing level 3 code${rowLabel}` }
        if (l3Code && !l3Name)
            throw { status: 400, message: `missing level 3 name${rowLabel}` }

        const l1 = ensureNode({
            level: 1,
            code: l1Code,
            name: l1Name,
            parent: null,
            pathCodes: [l1Code]
        })
        const l2 = ensureNode({
            level: 2,
            code: l2Code,
            name: l2Name,
            parent: l1,
            pathCodes: [l1Code, l2Code]
        })
        const leaf = l3Code
            ? ensureNode({
                level: 3,
                code: l3Code,
                name: l3Name,
                parent: l2,
                pathCodes: [l1Code, l2Code, l3Code]
            })
            : l2

        if (!subGroupCode) continue

        const existing = mapByCode.get(subGroupCode)
        if (existing && existing.categoryId !== leaf.id)
            throw {
                status: 400,
                message: `sub-group ${subGroupCode} maps to more than one category`
            }

        if (!existing) {
            mapByCode.set(subGroupCode, {
                subGroupCode,
                categoryId: leaf.id,
                superDepartmentCode: value(COL.SUPER_DEPARTMENT_CODE) || null,
                superDepartment: value(COL.SUPER_DEPARTMENT) || null,
                departmentCode: value(COL.DEPARTMENT_CODE) || null,
                department: value(COL.DEPARTMENT) || null,
                groupCode: value(COL.GROUP_CODE) || null,
                group: value(COL.GROUP) || null,
                subGroup: value(COL.SUB_GROUP) || null
            })
        }
    }

    if (!categoriesById.size)
        throw { status: 400, message: 'category CSV has no rows' }

    return {
        categories: [...categoriesById.values()],
        map: [...mapByCode.values()],
        counts
    }
}
