import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildCategoryCsv } from '#server/services/categoryMap/export.js'
import { buildCategoryPlan, EXPECTED_HEADER, parseCsvRows } from '#server/services/categoryMap/parse.js'

const categories = [
    { id: 'nc:216', code: '216', name: 'פירות וירקות', level: 1, parentId: null, sortOrder: 0 },
    // Comma in the name: must survive quoting.
    { id: 'nc:203', code: '203', name: 'בשר, עוף ודגים', level: 1, parentId: null, sortOrder: 1 },
    { id: 'nc:216:2016', code: '2016', name: 'פירות טריים', level: 2, parentId: 'nc:216', sortOrder: 0 },
    { id: 'nc:216:2017', code: '2017', name: 'ירקות', level: 2, parentId: 'nc:216', sortOrder: 1 },
    { id: 'nc:203:2003', code: '2003', name: 'בשר', level: 2, parentId: 'nc:203', sortOrder: 0 },
    { id: 'nc:203:2003:3002', code: '3002', name: 'עוף "מובחר"', level: 3, parentId: 'nc:203:2003', sortOrder: 0 },
    // No sub-group mapped to it at all.
    { id: 'nc:203:2005', code: '2005', name: 'תחליפים', level: 2, parentId: 'nc:203', sortOrder: 1 }
]

const mapDocs = [
    { subGroupCode: '10101', categoryId: 'nc:216:2016', department: 'פירות', departmentCode: '2016', subGroup: 'תפוחים' },
    { subGroupCode: '10100', categoryId: 'nc:216:2016', department: 'פירות', departmentCode: '2016', subGroup: 'בננות' },
    { subGroupCode: '30010', categoryId: 'nc:216:2017' },
    { subGroupCode: '20010', categoryId: 'nc:203:2003:3002' },
    { subGroupCode: '99999', categoryId: null },
    // Points at a category that no longer exists: treated as unassigned.
    { subGroupCode: '77777', categoryId: 'nc:404' }
]

const exportCsv = () => buildCategoryCsv({ categories, mapDocs })
const linesOf = csv => csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n')

describe('category map export', () => {
    it('writes the exact header the importer expects, as Excel-friendly text', () => {
        const { csv } = exportCsv()
        const lines = linesOf(csv)

        assert.ok(csv.startsWith('\uFEFF'), 'BOM for Excel')
        assert.ok(csv.includes('\r\n'), 'CRLF line endings')
        assert.deepEqual(lines[0].split(','), EXPECTED_HEADER)
    })

    it('round-trips through the parser unchanged', () => {
        const parsed = buildCategoryPlan(exportCsv().csv)
        const original = new Map(categories.map(category => [category.id, category]))
        const byId = new Map(parsed.categories.map(category => [category.id, category]))

        assert.equal(byId.size, original.size)
        for (const [id, category] of original) {
            const round = byId.get(id)
            assert.ok(round, `${id} survived the round trip`)
            assert.equal(round.name, category.name, `${id} name`)
            assert.equal(round.code, category.code, `${id} code`)
            assert.equal(round.level, category.level, `${id} level`)
            assert.equal(round.parentId || null, category.parentId || null, `${id} parent`)
        }

        // Sibling order comes from the file, which is written in tree order.
        for (const [id, category] of original)
            assert.equal(byId.get(id).sortOrder, category.sortOrder, `${id} sortOrder`)
    })

    it('keeps every assignment the map holds', () => {
        const parsed = buildCategoryPlan(exportCsv().csv)
        const assigned = new Map(
            parsed.map.filter(row => row.subGroupCode !== '99999').map(row => [row.subGroupCode, row.categoryId])
        )

        assert.equal(assigned.get('10100'), 'nc:216:2016')
        assert.equal(assigned.get('10101'), 'nc:216:2016')
        assert.equal(assigned.get('30010'), 'nc:216:2017')
        assert.equal(assigned.get('20010'), 'nc:203:2003:3002')
        assert.equal(parsed.counts.l1, 2)
        assert.equal(parsed.counts.l2, 4)
        assert.equal(parsed.counts.l3, 1)
    })

    it('leaves unassigned sub-groups out of the file', () => {
        const { csv, counts } = exportCsv()

        assert.ok(!csv.includes('99999'), 'no assignment row for an unassigned code')
        assert.ok(!csv.includes('77777'), 'a map row pointing at a missing category is unassigned too')
        assert.deepEqual(counts, { categories: 7, rows: 5, mapped: 4, unassigned: 2 })
    })

    it('keeps a category that has nothing mapped to it', () => {
        const rows = parseCsvRows(exportCsv().csv).slice(1)
        const placeholders = rows.filter(row => !row[7])

        assert.equal(placeholders.length, 1, 'only branches with nothing mapped get a row')
        assert.equal(placeholders[0][10], 'תחליפים')
        assert.equal(placeholders[0][11], '2005')
        assert.ok(buildCategoryPlan(exportCsv().csv).categories.some(category => category.id === 'nc:203:2005'))
    })

    it('quotes names that contain a comma or a quote', () => {
        const { csv } = exportCsv()

        assert.ok(csv.includes('"בשר, עוף ודגים"'))
        assert.ok(csv.includes('"עוף ""מובחר"""'))
    })

    it('orders rows like the admin tree and stays deterministic', () => {
        const { csv } = exportCsv()
        const codes = parseCsvRows(csv).slice(1).map(row => row[7])

        // Tree order, sub-group codes ascending inside each category. Ancestors
        // of a mapped category get no row of their own.
        assert.deepEqual(codes, ['10100', '10101', '30010', '20010', ''])
        assert.equal(csv, exportCsv().csv)
    })
})
