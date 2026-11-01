import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    normalizeRules,
    getRuleMatch,
    getMatchingRules,
    pickRule,
    getRuleUsage,
    getEffectiveUnit,
    getProductRuleGroups,
    annotateProduct,
    validateCart,
    getCartLineLimit
} from '../../common/functions/productRules.js'

const product = (over = {}) => ({
    id: 'p1',
    barcode: '111',
    category: { id: 'sg:2', pathIds: ['sd:1', 'd:2', 'g:3', 'sg:4'] },
    unit: { type: 'weight', step: 0.5, minAmount: 0.5 },
    ...over
})

const rule = (over = {}) => ({
    id: 'r1',
    name: 'Group',
    enabled: true,
    categoryIds: [],
    barcodes: [],
    excludeBarcodes: [],
    maxAmount: 0,
    step: 0,
    minAmount: 0,
    ...over
})

const line = (over = {}) => ({
    id: 'p1',
    barcode: '111',
    amount: 2,
    category: { pathIds: ['sd:1', 'd:2', 'g:3', 'sg:4'] },
    ...over
})

describe('normalizeRules', () => {
    it('accepts an array or a { groups } envelope', () => {
        const a = normalizeRules([rule()])
        const b = normalizeRules({ groups: [rule()] })
        assert.equal(a.groups.length, 1)
        assert.deepEqual(a, b)
    })

    it('drops invalid entries, bad category ids and duplicate ids', () => {
        const { groups } = normalizeRules([
            null,
            rule({ id: 'r1', categoryIds: ['sg:4', 'bogus', ''] }),
            rule({ id: 'r1', categoryIds: ['g:3'] })
        ])
        assert.equal(groups.length, 1)
        assert.deepEqual(groups[0].categoryIds, ['sg:4'])
    })

    it('trims barcodes and treats missing numeric fields as 0', () => {
        const [group] = normalizeRules([rule({ barcodes: [' 222 '], maxAmount: 'x' })]).groups
        assert.deepEqual(group.barcodes, ['222'])
        assert.equal(group.maxAmount, 0)
    })
})

describe('matchRule', () => {
    it('matches every ancestor level', () => {
        const p = product()
        for (const id of ['sd:1', 'd:2', 'g:3', 'sg:4'])
            assert.ok(getRuleMatch(p, rule({ categoryIds: [id] })), id)
    })

    it('does not match unrelated categories', () => {
        assert.equal(getRuleMatch(product(), rule({ categoryIds: ['sg:999'] })), null)
    })

    it('barcode match outranks category match', () => {
        const match = getRuleMatch(product(), rule({ barcodes: ['111'], categoryIds: ['sd:1'] }))
        assert.equal(match.level, 'barcode')
    })

    it('exclusions win over a barcode match', () => {
        assert.equal(getRuleMatch(product(), rule({ barcodes: ['111'], excludeBarcodes: ['111'] })), null)
    })

    it('ignores disabled rules', () => {
        assert.equal(getRuleMatch(product(), rule({ enabled: false, categoryIds: ['sd:1'] })), null)
    })
})

describe('step precedence', () => {
    it('most specific rule wins', () => {
        const rules = [
            rule({ id: 'sd', categoryIds: ['sd:1'], step: 1 }),
            rule({ id: 'sg', categoryIds: ['sg:4'], step: 0.1 })
        ]
        assert.equal(pickRule(product(), rules, 'step').id, 'sg')
        assert.equal(getEffectiveUnit(product(), rules).step, 0.1)
    })

    it('barcode beats every category level', () => {
        const rules = [
            rule({ id: 'sg', categoryIds: ['sg:4'], step: 0.1 }),
            rule({ id: 'bc', barcodes: ['111'], step: 0.25 })
        ]
        assert.equal(getEffectiveUnit(product(), rules).step, 0.25)
    })

    it('ties keep configured order', () => {
        const rules = [
            rule({ id: 'first', categoryIds: ['sg:4'], step: 0.1 }),
            rule({ id: 'second', categoryIds: ['sg:4'], step: 0.2 })
        ]
        assert.equal(getEffectiveUnit(product(), rules).step, 0.1)
    })

    it('never changes item products', () => {
        const item = product({ unit: { type: 'item', step: 1, minAmount: 1 } })
        assert.equal(getEffectiveUnit(item, [rule({ categoryIds: ['sd:1'], step: 0.1 })]).step, 1)
    })

    it('leaves products with size options alone', () => {
        const options = product({ unit: { type: 'weight', step: 0.5, minAmount: 0.5, options: [{ key: 's', amount: 1 }] } })
        assert.equal(getEffectiveUnit(options, [rule({ categoryIds: ['sd:1'], step: 0.1 })]).step, 0.5)
    })

    it('can override minAmount independently', () => {
        const unit = getEffectiveUnit(product(), [rule({ categoryIds: ['sd:1'], minAmount: 0.1 })])
        assert.equal(unit.minAmount, 0.1)
        assert.equal(unit.step, 0.5)
    })
})

describe('usage and caps', () => {
    const cart = [
        line({ id: 'a', amount: 2 }),
        line({ id: 'b', amount: 2 }),
        line({ id: 'c', amount: 1, missing: true }),
        line({ id: 'd', amount: 1, replacedBy: 'x' }),
        line({ id: 'e', amount: 3, status: 'admin_add' })
    ]

    it('counts valid lines only', () => {
        const r = rule({ categoryIds: ['sd:1'] })
        assert.equal(getRuleUsage(cart, r), 7)
    })

    it('can exclude admin-added lines', () => {
        const r = rule({ categoryIds: ['sd:1'] })
        assert.equal(getRuleUsage(cart, r, { includeAdminLines: false }), 4)
    })

    it('reports the strictest violation', () => {
        const rules = [
            rule({ id: 'wide', categoryIds: ['sd:1'], maxAmount: 10 }),
            rule({ id: 'tight', categoryIds: ['sg:4'], maxAmount: 5 })
        ]
        const violations = validateCart(cart, rules)
        assert.equal(violations.length, 1)
        assert.equal(violations[0].ruleId, 'tight')
        assert.equal(violations[0].usage, 7)
    })

    it('passes when customer lines are within the cap even if ops pushed it over', () => {
        const rules = [rule({ categoryIds: ['sd:1'], maxAmount: 5 })]
        assert.equal(validateCart(cart, rules).length, 1)
        assert.equal(validateCart(cart, rules, { includeAdminLines: false }).length, 0)
    })
})

describe('annotations and client limit', () => {
    it('annotates unit + cap groups', () => {
        const rules = [rule({ id: 'cap', categoryIds: ['sg:4'], maxAmount: 5 })]
        const annotated = annotateProduct(product(), rules)
        assert.deepEqual(annotated.ruleGroups, [{ id: 'cap', name: 'Group', maxAmount: 5 }])
        assert.equal(getProductRuleGroups(product(), rules).length, 1)
    })

    it('computes the per-line remaining from other lines', () => {
        const p = product({ id: 'p1', ruleGroups: [{ id: 'cap', name: 'Group', maxAmount: 5 }] })
        const cart = [
            line({ id: 'p1', amount: 2, ruleGroups: [{ id: 'cap', maxAmount: 5 }] }),
            line({ id: 'p2', amount: 2, ruleGroups: [{ id: 'cap', maxAmount: 5 }] })
        ]
        const limit = getCartLineLimit(p, cart)
        assert.equal(limit.maxAmount, 3)
        assert.equal(limit.limitReached, false)
        assert.equal(limit.rule.id, 'cap')
    })

    it('marks the group as full before the first add', () => {
        const p = product({ id: 'new', ruleGroups: [{ id: 'cap', maxAmount: 5 }] })
        const cart = [line({ id: 'other', amount: 5, ruleGroups: [{ id: 'cap', maxAmount: 5 }] })]
        const limit = getCartLineLimit(p, cart)
        assert.equal(limit.limitReached, true)
        assert.equal(limit.maxAmount, 0)
    })

    it('applies the global per-product cap on top of the group cap', () => {
        const p = product({ ruleGroups: [{ id: 'cap', maxAmount: 5 }] })
        const cart = [line({ id: 'p1', amount: 1, ruleGroups: [{ id: 'cap', maxAmount: 5 }] })]
        assert.equal(getCartLineLimit(p, cart, 3).maxAmount, 3)
    })

    it('stays at zero for a full group even when a global cap exists', () => {
        const p = product({ id: 'new', ruleGroups: [{ id: 'cap', maxAmount: 5 }] })
        const cart = [line({ id: 'other', amount: 5, ruleGroups: [{ id: 'cap', maxAmount: 5 }] })]
        const limit = getCartLineLimit(p, cart, 3)
        assert.equal(limit.limitReached, true)
        assert.equal(limit.maxAmount, 0)
    })
})
