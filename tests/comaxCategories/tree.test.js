import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildCategoryTree, clearCategoryTreeCache } from '../../server/services/comaxCategorySettings/tree.js'
import { resolveRules } from '../../server/services/comaxCategorySettings/index.js'

function makeDL({ settings = [], catalogCodes = ['7'], unassigned = [] } = {}) {
    return {
        CategoryMap: {
            read: async () => [
                {
                    subGroupCode: '7',
                    superDepartmentCode: '3',
                    superDepartment: 'מחלקה ראשית',
                    departmentCode: '13',
                    department: 'פירות וירקות',
                    groupCode: '4',
                    group: 'ירקות',
                    subGroup: 'עגבניות'
                }
            ]
        },
        ComaxCategorySetting: {
            read: async () => settings
        },
        Product: {
            constants: { STATUS: { ACTIVE: 'active' } },
            Model: {
                aggregate: async () => [{ _id: '7', count: 12 }]
            }
        },
        ComaxProduct: {
            Model: {
                distinct: async () => catalogCodes,
                find: () => ({ lean: async () => unassigned })
            }
        }
    }
}

describe('comax category tree', () => {
    it('builds four levels, rolls up the product count and resolves overrides', async () => {
        const DL = makeDL({
            settings: [
                { path: 'global', level: 'global', saleEnabled: true, saleDays: 30 },
                { path: '3/13', level: 'department', saleDays: 14 },
                { path: '3/13/4/7', level: 'subGroup', stockEnabled: false }
            ]
        })

        const result = await buildCategoryTree({ DL })
        assert.equal(result.tree.length, 1)

        const superNode = result.tree[0]
        assert.equal(superNode.level, 'superDepartment')
        assert.equal(superNode.productCount, 12)
        assert.equal(superNode.rule.saleDays, 30)

        const department = superNode.children[0]
        assert.equal(department.level, 'department')
        assert.equal(department.rule.saleDays, 14)
        assert.equal(department.productCount, 12)

        const group = department.children[0]
        assert.equal(group.level, 'group')
        assert.equal(group.rule.saleDays, 14)

        const subGroup = group.children[0]
        assert.equal(subGroup.level, 'subGroup')
        assert.equal(subGroup.productCount, 12)
        assert.equal(subGroup.code, '7')
        assert.equal(subGroup.rule.stockEnabled, false)
        assert.equal(subGroup.rule.saleDays, 14)
        assert.deepEqual(subGroup.override, { stockEnabled: false })
        // Ancestor names/codes are no longer repeated on every node.
        assert.equal(subGroup.superDepartmentCode, undefined)
        assert.equal(subGroup.inherited, undefined)
        assert.equal(result.global.saleDays, 30)
    })

    it('adds catalog sub-groups the category map has not met yet', async () => {
        const DL = makeDL({
            catalogCodes: ['7', '8'],
            unassigned: [{
                subGroupCode: '8',
                superDepartmentCode: '9',
                superDepartment: 'חטיפים',
                departmentCode: '20',
                department: 'מלוחים',
                groupCode: '40',
                group: 'במבה',
                subGroup: 'במבה'
            }]
        })

        const result = await buildCategoryTree({ DL })
        assert.equal(result.tree.length, 2)

        const extra = result.tree.find(node => node.path === '9')
        assert.ok(extra)
        assert.equal(extra.children[0].children[0].children[0].code, '8')
        assert.equal(extra.name, 'חטיפים')
    })

    it('resolves every node exactly like resolveRules', async () => {
        const settings = [
            {
                path: 'global',
                level: 'global',
                saleEnabled: true,
                saleDays: 45,
                stockEnabled: true,
                minStock: 2
            },
            { path: '3', level: 'superDepartment', saleDays: 14 },
            // Enabled without a value: must fall back to the global default.
            { path: '3/13', level: 'department', saleEnabled: true },
            { path: '3/13/4/7', level: 'subGroup', stockEnabled: false, hidden: true }
        ]

        const DL = makeDL({ settings })
        const result = await buildCategoryTree({ DL })
        const settingsByPath = new Map(settings.map(row => [row.path, row]))

        const walk = nodes => {
            for (const node of nodes) {
                const segments = node.path.split('/')
                const expected = resolveRules(settingsByPath, {
                    superDepartmentCode: segments[0],
                    departmentCode: segments[1],
                    groupCode: segments[2],
                    subGroupCode: segments[3]
                })
                assert.deepEqual(node.rule, expected, node.path)
                walk(node.children || [])
            }
        }
        walk(result.tree)
    })

    it('serves repeat loads from the cache and rebuilds after invalidation', async () => {
        const DL = makeDL({ settings: [] })
        let reads = 0
        const originalRead = DL.CategoryMap.read
        DL.CategoryMap.read = async (...args) => {
            reads += 1
            return originalRead(...args)
        }

        const first = await buildCategoryTree({ DL })
        const second = await buildCategoryTree({ DL })
        assert.equal(reads, 1)
        assert.equal(first, second)

        clearCategoryTreeCache(DL)
        await buildCategoryTree({ DL })
        assert.equal(reads, 2)
    })
})
