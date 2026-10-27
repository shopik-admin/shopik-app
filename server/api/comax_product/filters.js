import buildFilterDescriptors from '#server/utils/buildFilterDescriptors.js'

// superDepartment/department are free-text Comax values (15 / 96 distinct), so
// the options come from the collection instead of the schema. Both descriptors
// are rendered as multi-select enums -> filter { $in: [...] }, which is the
// shape Model.processFilter passes straight through to read/count.
export const MAIN_FIELDS = ['superDepartment', 'department']

async function distinctValues(Model, field) {
    const values = await Model.distinct(field)
    return [...new Set(values.map(v => String(v ?? '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'he'))
}

export default async function filters(payload, { DL }) {
    const Model = DL.ComaxProduct.Model
    const [superDepartments, departments] = await Promise.all([
        distinctValues(Model, 'superDepartment'),
        distinctValues(Model, 'department')
    ])
    const options = { superDepartment: superDepartments, department: departments }

    return buildFilterDescriptors(DL.ComaxProduct, MAIN_FIELDS)
        .filter(descriptor => options[descriptor.key])
        .map(descriptor => ({ ...descriptor, type: 'enum', options: options[descriptor.key] }))
}

filters.config = {
    permissions: ['comax_product:read']
}
