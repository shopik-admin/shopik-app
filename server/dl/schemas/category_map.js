// One row per Comax sub-group code. categoryId is the new site category the
// sub-group is mapped to; null means "not assigned yet" (shown in the admin
// coverage screen). The old Comax hierarchy is kept as display/search metadata.
const categoryMapSchema = {
    subGroupCode: { type: String, required: true, filter: 'exact' },
    categoryId: { type: String, filter: 'exact' },
    superDepartmentCode: String,
    superDepartment: String,
    departmentCode: String,
    department: String,
    groupCode: String,
    group: String,
    subGroup: String,
    // Flags loaded from the Comax category-filter file. Missing means the
    // default: show the sub-group and do not require kashrut. They live here
    // (not on Product) because the nightly sync re-derives every status.
    showOnSite: { type: Boolean, filter: true },
    requireKashrut: { type: Boolean, filter: true },
    // Mirror of the mapped Category's (cascaded) active state. Missing means
    // active. Kept separate from showOnSite on purpose: un-hiding a category
    // must never override a sub-group Comax marked permanently hidden.
    categoryActive: { type: Boolean, filter: true }
}

export const meta = {
    // Read on every sync; keep it out of the cache so coverage/assignment reads
    // always reflect the last admin action.
    noId: true,
    noActive: true,
    index: [
        { subGroupCode: 1, unique: true },
        { categoryId: 1 }
    ]
}

export default categoryMapSchema
