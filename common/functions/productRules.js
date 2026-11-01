import { round3 } from './calcOrder/utils.js'

// A "product rule" targets a set of products (Comax category ids at any level
// and/or barcodes) and can cap the quantity per order and/or override the
// stepper increment. The same rule shape powers both behaviours so the admin
// only maintains one list.
//
// Category ids are qualified by level because Comax codes are only unique
// within a level: `sd:` super department, `d:` department, `g:` group,
// `sg:` subgroup. A rule that targets a parent level matches every descendant
// because products store their full ancestry in `category.pathIds`.

export const RULE_MATCH_RANK = {
    sd: 1,
    d: 2,
    g: 3,
    sg: 4,
    barcode: 5
}

const LEVEL_RE = /^(sd|d|g|sg):.+$/

function toPositiveNumber(value) {
    const num = Number(value)
    return Number.isFinite(num) && num > 0 ? num : 0
}

function toStringList(value) {
    if (!Array.isArray(value)) return []
    return [...new Set(value.map(v => String(v ?? '').trim()).filter(Boolean))]
}

function toCategoryIds(value) {
    return toStringList(value).filter(id => LEVEL_RE.test(id))
}

function toBarcode(value) {
    return String(value ?? '').trim()
}

function getPathIds(item) {
    const pathIds = item?.category?.pathIds
    if (Array.isArray(pathIds) && pathIds.length) return pathIds
    const id = item?.category?.id
    return id ? [id] : []
}

export function normalizeRule(rule, index = 0) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return null
    const id = String(rule.id ?? '').trim() || `pg_${index}`
    const name = String(rule.name ?? '').trim() || `Product group ${index + 1}`
    return {
        id,
        name,
        enabled: rule.enabled !== false,
        categoryIds: toCategoryIds(rule.categoryIds),
        barcodes: toStringList(rule.barcodes),
        excludeBarcodes: toStringList(rule.excludeBarcodes),
        maxAmount: toPositiveNumber(rule.maxAmount),
        step: toPositiveNumber(rule.step),
        minAmount: toPositiveNumber(rule.minAmount)
    }
}

export function normalizeRules(raw) {
    const list = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.groups)
            ? raw.groups
            : []
    const groups = []
    const seen = new Set()
    for (let i = 0; i < list.length; i++) {
        const rule = normalizeRule(list[i], i)
        if (!rule) continue
        // Ids are the client's usage key. A duplicate would merge two rules'
        // caps into one, so keep the first and drop the rest.
        if (seen.has(rule.id)) continue
        seen.add(rule.id)
        groups.push(rule)
    }
    return { version: 1, groups }
}

export function hasTargets(rule) {
    return !!rule && (rule.categoryIds?.length > 0 || rule.barcodes?.length > 0)
}

// Highest-specificity reason this item is covered by the rule, or null.
export function getRuleMatch(item, rule) {
    if (!rule || rule.enabled === false) return null
    const barcode = toBarcode(item?.barcode)
    if (barcode && rule.excludeBarcodes?.includes(barcode)) return null
    if (barcode && rule.barcodes?.includes(barcode))
        return { level: 'barcode', rank: RULE_MATCH_RANK.barcode, target: barcode }

    const pathIds = getPathIds(item)
    if (!pathIds.length || !rule.categoryIds?.length) return null

    let best = null
    for (const id of rule.categoryIds) {
        if (!pathIds.includes(id)) continue
        const level = id.slice(0, id.indexOf(':'))
        const rank = RULE_MATCH_RANK[level] || 0
        if (!best || rank > best.rank) best = { level, rank, target: id }
    }
    return best
}

export function matchesRule(item, rule) {
    return !!getRuleMatch(item, rule)
}

// Matching rules ordered most-specific first; ties keep their configured
// order so an admin can control step precedence by list position.
export function getMatchingRules(item, rules, field) {
    const out = []
    for (let i = 0; i < (rules?.length || 0); i++) {
        const rule = rules[i]
        if (!rule || rule.enabled === false) continue
        if (field && !(Number(rule[field]) > 0)) continue
        const match = getRuleMatch(item, rule)
        if (match) out.push({ rule, match, index: i })
    }
    out.sort((a, b) => b.match.rank - a.match.rank || a.index - b.index)
    return out
}

export function pickRule(item, rules, field) {
    return getMatchingRules(item, rules, field)[0]?.rule || null
}

function isCountedLine(line, includeAdminLines) {
    if (!line || line.amount == null) return false
    if (!(Number(line.amount) > 0)) return false
    // Replaced/missing lines are not part of what the customer receives.
    if (line.missing || line.replacedBy) return false
    // Ops replacements may exceed a cap; only customer-added lines count when
    // the caller asks for the customer's own usage (payment gate).
    if (!includeAdminLines && line.status === 'admin_add') return false
    return true
}

export function getRuleUsage(cart, rule, { includeAdminLines = true } = {}) {
    let usage = 0
    for (const line of cart || []) {
        if (!isCountedLine(line, includeAdminLines)) continue
        if (!matchesRule(line, rule)) continue
        usage += Number(line.amount) || 0
    }
    return round3(usage)
}

// Effective stepper values for a product. Step/min overrides are weight-only:
// applying them to an item product would allow fractional packs. Products with
// explicit size options derive their amount from the chosen option, so their
// step is left untouched too.
export function getEffectiveUnit(product, rules) {
    const unit = { ...(product?.unit || {}) }
    if (unit.type !== 'weight' || unit.options?.length) return unit
    const stepRule = pickRule(product, rules, 'step')
    const minRule = pickRule(product, rules, 'minAmount')
    if (stepRule) unit.step = stepRule.step
    if (minRule) unit.minAmount = minRule.minAmount
    return unit
}

// Cap rules that apply to this product, as sent to the storefront. Only the
// data the client needs to compute usage is included.
export function getProductRuleGroups(product, rules) {
    return getMatchingRules(product, rules, 'maxAmount')
        .map(({ rule }) => ({ id: rule.id, name: rule.name, maxAmount: rule.maxAmount }))
}

export function annotateProduct(product, rules) {
    if (!product || typeof product !== 'object') return product
    return {
        ...product,
        unit: getEffectiveUnit(product, rules),
        ruleGroups: getProductRuleGroups(product, rules)
    }
}

export function annotateCart(cart, rules) {
    if (!Array.isArray(cart)) return cart
    return cart.map(line => annotateProduct(line, rules))
}

// Violations for a whole cart. `includeAdminLines` matches the caller's policy:
// customer cart edits count every line (so the visible cart stays within the
// cap), while payment only blocks what the customer added themselves.
export function validateCart(cart, rules, { includeAdminLines = true } = {}) {
    const violations = []
    for (const rule of rules || []) {
        if (!rule || rule.enabled === false || !(Number(rule.maxAmount) > 0)) continue
        const usage = getRuleUsage(cart, rule, { includeAdminLines })
        if (usage > rule.maxAmount + 1e-9) {
            violations.push({
                ruleId: rule.id,
                ruleName: rule.name,
                max: rule.maxAmount,
                usage
            })
        }
    }
    return violations
}

// Client-side limit for one cart line, computed from the server annotations
// (`ruleGroups` on the product and on every cart line). Returns the maximum
// amount this line may hold; `limitReached` disables the first add when the
// group is already full.
export function getCartLineLimit(product, cart, productMaxAmount = 0) {
    const groups = product?.ruleGroups || []
    const current = round3(Number(cart?.find(line => line?.id === product?.id)?.amount) || 0)

    let best = null
    for (const group of groups) {
        const max = Number(group?.maxAmount) || 0
        if (max <= 0) continue
        let usage = 0
        for (const line of cart || []) {
            if (!isCountedLine(line, true)) continue
            if (!Array.isArray(line.ruleGroups)) continue
            if (!line.ruleGroups.some(entry => entry?.id === group.id)) continue
            usage += Number(line.amount) || 0
        }
        const remaining = round3(max - (usage - current))
        if (!best || remaining < best.maxAmount) best = { maxAmount: Math.max(0, remaining), rule: group }
    }

    const globalMax = toPositiveNumber(productMaxAmount)
    // A group cap always wins: when it is exhausted, the line max is 0 even if
    // the global per-product cap is looser.
    const maxAmount = best
        ? (globalMax > 0 ? Math.min(best.maxAmount, globalMax) : best.maxAmount)
        : globalMax

    return {
        maxAmount,
        limitReached: !!best && best.maxAmount <= 0,
        rule: best?.rule || null
    }
}

export default {
    RULE_MATCH_RANK,
    normalizeRule,
    normalizeRules,
    hasTargets,
    getRuleMatch,
    matchesRule,
    getMatchingRules,
    pickRule,
    getRuleUsage,
    getEffectiveUnit,
    getProductRuleGroups,
    annotateProduct,
    annotateCart,
    validateCart,
    getCartLineLimit
}
