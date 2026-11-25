// Per-node settings for the Comax category tree.
//
// One row per node an admin actually overrides; a missing field inherits from
// the nearest ancestor (subGroup > group > department > superDepartment >
// global). `path` is the full hierarchy key so a group code that exists under
// two departments never shares a setting by accident.
//
// The category_map stays the source of the Comax hierarchy and of the site
// mapping. This collection only owns the sale/stock/hide rules, so a category
// CSV re-import can never wipe them.
const comaxCategorySettingSchema = {
    // 'global' or '<super>[/<department>[/<group>[/<subGroup>]]]'
    path: { type: String, required: true, filter: 'exact' },
    level: {
        type: String,
        enum: ['global', 'superDepartment', 'department', 'group', 'subGroup'],
        filter: true
    },

    superDepartmentCode: String,
    departmentCode: String,
    groupCode: String,
    subGroupCode: String,
    superDepartment: String,
    department: String,
    group: String,
    subGroup: String,

    // Missing means "inherit". An explicit false is a real override: it turns
    // the gate off for this node and everything below it until a deeper node
    // turns it back on.
    saleEnabled: Boolean,
    saleDays: Number,
    stockEnabled: Boolean,
    minStock: Number,
    hidden: Boolean,
    requireKashrut: Boolean
}

export const meta = {
    // Settings are tiny and must reflect the last admin save immediately.
    noId: true,
    noActive: true,
    index: [
        { path: 1, unique: true },
        { level: 1 }
    ]
}

export default comaxCategorySettingSchema
