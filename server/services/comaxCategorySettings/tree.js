import {
    createRuleState,
    finalizeRuleState,
    loadSettings,
    pathFor,
    resolveRulesForComax,
    stepRuleState
} from './index.js'

const cleanCode = value => (value == null ? '' : String(value).trim())
const cleanName = (name, code) => (name == null || String(name).trim() === '' ? cleanCode(code) : String(name).trim())

const LEVEL_DEPTH = {
    superDepartment: 1,
    department: 2,
    group: 3,
    subGroup: 4
}
const CODE_FIELDS = ['superDepartmentCode', 'departmentCode', 'groupCode', 'subGroupCode']

function ensureNode(byPath, { path, level, codes = {}, names = {} }) {
    if (byPath.has(path)) return byPath.get(path)
    const depth = LEVEL_DEPTH[level] || 0
    const ownCodes = {}
    for (let index = 0; index < depth; index++)
        ownCodes[CODE_FIELDS[index]] = codes[CODE_FIELDS[index]]
    const node = {
        id: path,
        path,
        level,
        code: cleanCode(ownCodes[`${level}Code`] ?? ''),
        name: cleanName(names[level], ownCodes[`${level}Code`]),
        superDepartmentCode: cleanCode(ownCodes.superDepartmentCode) || null,
        departmentCode: cleanCode(ownCodes.departmentCode) || null,
        groupCode: cleanCode(ownCodes.groupCode) || null,
        subGroupCode: cleanCode(ownCodes.subGroupCode) || null,
        superDepartment: cleanName(names.superDepartment, ownCodes.superDepartmentCode),
        department: cleanName(names.department, ownCodes.departmentCode),
        group: cleanName(names.group, ownCodes.groupCode),
        subGroup: cleanName(names.subGroup, ownCodes.subGroupCode),
        productCount: 0,
        children: []
    }
    byPath.set(path, node)
    return node
}

function addProductCount(byPath, paths, count) {
    for (const path of paths) {
        const node = byPath.get(path)
        if (node) node.productCount += count
    }
}

const nameCollator = new Intl.Collator('he')
const codeCollator = new Intl.Collator('en', { numeric: true })

function sortTree(nodes) {
    // Reusing the collators matters: localeCompare(locale) builds one per call,
    // and the tree sorts ~1 700 nodes on every page load (≈450 ms of a 505 ms
    // response).
    return nodes
        .sort((a, b) => nameCollator.compare(a.name, b.name) || codeCollator.compare(a.code, b.code))
        .map(node => {
            node.children = sortTree(node.children)
            return node
        })
}

/**
 * Response shape: only the node's own code and name. Every ancestor's code is
 * already a path segment and its name is on the ancestor node, so repeating all
 * four levels per node doubled the payload (1 284 kB → 626 kB).
 */
function toResponseNode(node) {
    const out = {
        path: node.path,
        level: node.level,
        code: node.code,
        name: node.name,
        rule: node.rule
    }
    if (node.productCount) out.productCount = node.productCount
    if (node.override) out.override = node.override
    if (node.children?.length) out.children = node.children.map(toResponseNode)
    return out
}

function directRow(settingsByPath, path) {
    const row = settingsByPath.get(path)
    if (!row) return null
    const fields = {}
    for (const key of ['saleEnabled', 'saleDays', 'stockEnabled', 'minStock', 'hidden', 'requireKashrut'])
        if (row[key] !== undefined && row[key] !== null) fields[key] = row[key]
    return Object.keys(fields).length ? fields : null
}

/**
 * The Comax hierarchy tree with each node's effective rule and its direct
 * override (if any). Built from category_map, plus catalog rows for sub-groups
 * the map has not met yet.
 *
 * Building it reads two whole collections (category_map + every setting row)
 * and builds ~2 400 nodes; the CPU profile shows that decode/building, not rule
 * resolution, is the cost. The settings screen loads it once, so a short
 * per-DL cache makes repeat loads free: an admin save clears it, and the TTL
 * covers the nightly sync's product counts.
 */
const TREE_TTL_MS = 60_000
const treeCache = new WeakMap()

export function clearCategoryTreeCache(DL) {
    treeCache.delete(DL)
}

export async function buildCategoryTree({ DL }) {
    const cached = treeCache.get(DL)
    if (cached && Date.now() - cached.at < TREE_TTL_MS) return cached.tree

    const [mapRows, settingsByPath, counts] = await Promise.all([
        DL.CategoryMap.read(
            {},
            {
                _id: 0,
                subGroupCode: 1,
                superDepartmentCode: 1,
                superDepartment: 1,
                departmentCode: 1,
                department: 1,
                groupCode: 1,
                group: 1,
                subGroup: 1
            },
            { limit: 0 }
        ),
        loadSettings(DL),
        DL.Product.Model.aggregate([
            { $match: { status: DL.Product.constants.STATUS.ACTIVE } },
            { $group: { _id: '$comaxSubGroupCode', count: { $sum: 1 } } }
        ], { allowDiskUse: true })
    ])

    // Catalog sub-groups the map has not met yet. A `distinct` on the indexed
    // subGroupCode is an index-only 5 ms read; grouping the whole catalog with
    // hierarchy names FETCHed every row (≈90 ms per tree load).
    const mapCodes = new Set()
    for (const row of mapRows || []) {
        const code = cleanCode(row?.subGroupCode)
        if (code) mapCodes.add(code)
    }
    const catalogCodes = (await DL.ComaxProduct.Model.distinct('subGroupCode') || [])
        .map(cleanCode)
        .filter(Boolean)
    const missingCodes = [...new Set(catalogCodes)].filter(code => !mapCodes.has(code))

    let comaxRows = []
    if (missingCodes.length) {
        const rows = await DL.ComaxProduct.Model.find(
            { subGroupCode: { $in: missingCodes } },
            {
                _id: 0,
                subGroupCode: 1,
                superDepartmentCode: 1,
                superDepartment: 1,
                departmentCode: 1,
                department: 1,
                groupCode: 1,
                group: 1,
                subGroup: 1
            }
        ).lean()
        const seen = new Set()
        for (const row of rows || []) {
            const code = cleanCode(row?.subGroupCode)
            if (!code || seen.has(code)) continue
            seen.add(code)
            comaxRows.push(row)
        }
    }

    const countByCode = new Map()
    for (const row of counts || []) {
        if (row?._id == null) continue
        countByCode.set(String(row._id), row.count || 0)
    }

    const byPath = new Map()
    const seenCodes = new Set()

    const addRow = row => {
        const code = cleanCode(row?.subGroupCode)
        if (!code || seenCodes.has(code)) return
        seenCodes.add(code)

        const codes = {
            superDepartmentCode: cleanCode(row.superDepartmentCode),
            departmentCode: cleanCode(row.departmentCode),
            groupCode: cleanCode(row.groupCode),
            subGroupCode: code
        }
        const names = {
            superDepartment: row.superDepartment,
            department: row.department,
            group: row.group,
            subGroup: row.subGroup
        }

        const paths = [
            pathFor('superDepartment', codes),
            pathFor('department', codes),
            pathFor('group', codes),
            pathFor('subGroup', codes)
        ]

        const superNode = ensureNode(byPath, {
            path: paths[0],
            level: 'superDepartment',
            codes,
            names
        })
        const departmentNode = ensureNode(byPath, {
            path: paths[1],
            level: 'department',
            codes,
            names
        })
        const groupNode = ensureNode(byPath, {
            path: paths[2],
            level: 'group',
            codes,
            names
        })
        const subGroupNode = ensureNode(byPath, {
            path: paths[3],
            level: 'subGroup',
            codes,
            names
        })

        if (!superNode.children.includes(departmentNode)) superNode.children.push(departmentNode)
        if (!departmentNode.children.includes(groupNode)) departmentNode.children.push(groupNode)
        if (!groupNode.children.includes(subGroupNode)) groupNode.children.push(subGroupNode)

        addProductCount(byPath, paths, countByCode.get(code) || 0)
    }

    for (const row of mapRows || []) addRow(row)

    // Catalog rows not in the map: still visible for settings, because an
    // unassigned sub-group can still be hidden or sale-filtered.
    for (const row of comaxRows) {
        addRow({
            subGroupCode: row?.subGroupCode,
            superDepartmentCode: row?.superDepartmentCode,
            superDepartment: row?.superDepartment,
            departmentCode: row?.departmentCode,
            department: row?.department,
            groupCode: row?.groupCode,
            group: row?.group,
            subGroup: row?.subGroup
        })
    }

    // Resolve rules top-down: each node reuses its parent's resolved state and
    // merges only its own row. resolveRules() per node replayed global → super →
    // department → group → subGroup for all 2 300+ nodes (≈40 ms of the request).
    const { state: rootState, globalRule } = createRuleState(settingsByPath)
    const applyRules = (node, parentState) => {
        const state = stepRuleState(parentState, settingsByPath.get(node.path))
        node.rule = finalizeRuleState(state, globalRule)
        node.override = directRow(settingsByPath, node.path)
        node.inherited = !node.override
        for (const child of node.children) applyRules(child, state)
    }
    const roots = [...byPath.values()].filter(node => node.level === 'superDepartment')
    for (const root of roots) applyRules(root, rootState)

    const tree = sortTree(roots).map(toResponseNode)
    const global = resolveRulesForComax(settingsByPath, {})

    const result = {
        tree,
        global: {
            ...global,
            override: directRow(settingsByPath, 'global')
        },
        settingsCount: settingsByPath.size,
        categories: byPath.size,
        products: countByCode.size
    }
    // The router serialises this immediately; callers treat it as read-only.
    treeCache.set(DL, { at: Date.now(), tree: result })
    return result
}

export default buildCategoryTree
