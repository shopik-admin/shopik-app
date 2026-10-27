import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import buildComaxFilters from '../../server/api/comax_product/filters.js'

describe('comax_product filters', () => {
    const values = {
        superDepartment: ['', 'ירקות ופירות', 'בשר ודגים', null],
        department: ['מחלקה ב', 'מחלקה א', '']
    }
    const DL = {
        ComaxProduct: {
            Model: {
                filterFields: new Set(['superDepartment', 'department', 'barcode']),
                schema: { path: () => ({ instance: 'String' }) },
                distinct: async field => values[field]
            }
        }
    }

    it('returns only the two department descriptors as multi-select enums', async () => {
        const descriptors = await buildComaxFilters({}, { DL })

        assert.deepEqual(descriptors.map(d => d.key), ['superDepartment', 'department'])
        for (const descriptor of descriptors) {
            assert.equal(descriptor.type, 'enum')
            assert.equal(descriptor.main, true)
        }
    })

    it('pulls options from the collection, drops blanks and sorts in Hebrew', async () => {
        const [superDepartments, departments] = await buildComaxFilters({}, { DL })

        assert.deepEqual(superDepartments.options, ['בשר ודגים', 'ירקות ופירות'])
        assert.deepEqual(departments.options, ['מחלקה א', 'מחלקה ב'])
    })
})
