import { EXPECTED_HEADER } from './parse.js'

const CATEGORY_FIELDS = { _id: 0, id: 1, code: 1, name: 1, level: 1, parentId: 1, sortOrder: 1 }
const MAP_FIELDS = {
    _id: 0,
    subGroupCode: 1,
    categoryId: 1,
    superDepartmentCode: 1,
    superDepartment: 1,
    departmentCode: 1,
    department: 1,
    groupCode: 1,
    group: 1,
    subGroup: 1
}

const escapeCell = value => {
    const text = String(value ?? '')
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// Same sibling order the admin tree shows.
const byCategorySort = (a, b) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
    String(a.name).localeCompare(String(b.name), 'he')

const byCode = (a, b) =>
    String(a.subGroupCode).localeCompare(String(b.subGroupCode), 'he', { numeric: true })

/** Category chain from level 1 down to the given category. */
function chainOf(category, byId) {
    const chain = []
    let node = category

    for (let hop = 0; node && hop < 5; hop++) {
        chain.unshift(node)
        node = node.parentId ? byId.get(node.parentId) : null
    }

    return chain
}

/**
 * Build a category-map CSV from the stored tree + map. It is the exact inverse
 * of `buildCategoryPlan`: feeding it back reproduces the same ids, hierarchy,
 * sibling order and assignments.
 *
 * Rows are grouped by category in tree order, so the file reads like the admin
 * tree and edits diff cleanly.
 *
 * Two things are intentionally absent:
 * - Unassigned sub-groups: the importer recreates every active-product code as
 *   unassigned, so they survive a re-import without being listed here.
 * - Icons / active flags: those are admin-only fields and are carried over by
 *   the importer for every category id that still exists.
 */
export function buildCategoryCsv({ categories = [], mapDocs = [] }) {
    const byId = new Map(categories.map(category => [category.id, category]))

    const byParent = new Map()
    for (const category of categories) {
        const key = category.parentId || null
        if (!byParent.has(key)) byParent.set(key, [])
        byParent.get(key).push(category)
    }

    // Depth-first, siblings in admin order: parents are always written before
    // their children, which is what the parser expects for path building.
    const ordered = []
    const walk = parentId => {
        for (const category of (byParent.get(parentId) || []).slice().sort(byCategorySort)) {
            ordered.push(category)
            walk(category.id)
        }
    }
    walk(null)

    const docsByCategory = new Map()
    const unassigned = []
    for (const doc of mapDocs) {
        const category = doc.categoryId ? byId.get(doc.categoryId) : null
        if (!category) {
            unassigned.push(doc)
            continue
        }
        const key = category.id
        if (!docsByCategory.has(key)) docsByCategory.set(key, [])
        docsByCategory.get(key).push(doc)
    }

    const cellsFor = (chain, doc = {}) => [
        doc.superDepartment || '',
        doc.superDepartmentCode || '',
        doc.department || '',
        doc.departmentCode || '',
        doc.group || '',
        doc.groupCode || '',
        doc.subGroup || '',
        doc.subGroupCode || '',
        // Site columns: level 1/2/3 name + code; a level 2 leaf leaves level 3 empty.
        ...[0, 1, 2].flatMap(index => [
            chain[index]?.name || '',
            chain[index]?.code || ''
        ])
    ]

    // Categories that only exist as ancestors of a mapped category do not need
    // a row of their own - their children's rows already create them.
    const covered = new Set()
    for (const category of byId.values()) {
        if (!docsByCategory.has(category.id)) continue
        let node = category
        for (let hop = 0; node && hop < 5; hop++) {
            covered.add(node.id)
            node = node.parentId ? byId.get(node.parentId) : null
        }
    }

    const rows = []
    for (const category of ordered) {
        const chain = chainOf(category, byId)
        if (chain.length !== category.level) continue

        const docs = docsByCategory.get(category.id)
        if (!docs?.length) {
            // Nothing mapped in this branch: keep the category alive through a
            // re-import, otherwise the tree replacement would delete it.
            if (covered.has(category.id)) continue
            rows.push(cellsFor(chain))
            continue
        }

        for (const doc of docs.slice().sort(byCode))
            rows.push(cellsFor(chain, doc))
    }

    const csv = [EXPECTED_HEADER, ...rows].map(row => row.map(escapeCell).join(',')).join('\r\n')

    // BOM so Excel opens Hebrew correctly; the parser strips it again.
    return {
        csv: `\uFEFF${csv}\r\n`,
        counts: {
            categories: ordered.length,
            rows: rows.length,
            mapped: mapDocs.length - unassigned.length,
            unassigned: unassigned.length
        }
    }
}

export async function exportCategoryMap({ DL }) {
    const [categories, mapDocs] = await Promise.all([
        DL.Category.read({}, CATEGORY_FIELDS, { limit: 0 }),
        DL.CategoryMap.read({}, MAP_FIELDS, { limit: 0 })
    ])

    return buildCategoryCsv({ categories: categories || [], mapDocs: mapDocs || [] })
}
