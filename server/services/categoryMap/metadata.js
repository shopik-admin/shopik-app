export const COMAX_META_FIELDS = {
    superDepartmentCode: 1,
    superDepartment: 1,
    departmentCode: 1,
    department: 1,
    groupCode: 1,
    group: 1,
    subGroup: 1
}

export function metaFromComax(comax = {}) {
    return {
        superDepartmentCode: comax.superDepartmentCode || null,
        superDepartment: comax.superDepartment || null,
        departmentCode: comax.departmentCode || null,
        department: comax.department || null,
        groupCode: comax.groupCode || null,
        group: comax.group || null,
        subGroup: comax.subGroup || null
    }
}

export async function metadataForCode(DL, code) {
    const doc = await DL.ComaxProduct.Model.findOne(
        { subGroupCode: String(code) },
        { _id: 0, ...COMAX_META_FIELDS }
    ).lean()
    return doc ? metaFromComax(doc) : {}
}
