import toSlug from '#common/functions/toSlug.js'

export default async function buildCategories(payload, { DL }) {
    const comaxProducts = await DL.ComaxProduct.read(
        {
            superDepartmentCode: { $exists: true, $nin: ['12', null] },
            departmentCode: { $exists: true },
            groupCode: { $exists: true }
        },
        {
            _id: 0,
            superDepartmentCode: 1,
            superDepartment: 1,
            departmentCode: 1,
            department: 1,
            groupCode: 1,
            group: 1,
            subGroupCode: 1,
            subGroup: 1
        },
        { limit: 0 }
    )

    if (comaxProducts.length === 0) {
        return { message: 'No comax products to extract categories from', count: 0 }
    }

    const superDepartmentMap = new Map()
    const departmentMap = new Map()
    const groupMap = new Map()
    const subGroupMap = new Map()

    for (const p of comaxProducts) {
        const allCodes = [p.superDepartmentCode, p.departmentCode, p.groupCode, p.subGroupCode]
        const allNames = [p.superDepartment, p.department, p.group, p.subGroup]
        const hasAllCodes = allCodes.every(code => code)
        const hasAllNames = allNames.every(name => name)

        if (!hasAllCodes || !hasAllNames) {
            console.log(`[Comax Categories] Skipping product with incomplete category info: ${p.comaxId}`)
            continue
        }

        const superDepartmentSlug = toSlug(p.superDepartment)
        const departmentSlug = toSlug(p.department)
        const groupSlug = toSlug(p.group)
        const subGroupSlug = toSlug(p.subGroup)

        superDepartmentMap.set(p.superDepartmentCode, {
            name: p.superDepartment,
            slug: superDepartmentSlug,
            path: superDepartmentSlug,
            parentId: null,
            parentIds: []
        })

        departmentMap.set(p.departmentCode, {
            name: p.department,
            slug: departmentSlug,
            path: `${superDepartmentSlug}/${departmentSlug}`,
            parentId: p.superDepartmentCode,
            parentIds: [p.superDepartmentCode]
        })

        groupMap.set(p.groupCode, {
            name: p.group,
            slug: groupSlug,
            path: `${superDepartmentSlug}/${departmentSlug}/${groupSlug}`,
            parentId: p.departmentCode,
            parentIds: p.departmentCode ? [p.superDepartmentCode, p.departmentCode] : []
        })

        subGroupMap.set(p.subGroupCode, {
            name: p.subGroup,
            slug: subGroupSlug,
            path: `${superDepartmentSlug}/${departmentSlug}/${groupSlug}/${subGroupSlug}`,
            parentId: p.groupCode,
            parentIds: p.groupCode ? [p.superDepartmentCode, p.departmentCode, p.groupCode] : []
        })
    }

    const categories = []

    for (const [code, superDept] of superDepartmentMap) {
        categories.push({
            id: code,
            name: superDept.name,
            slug: superDept.slug,
            path: superDept.path,
            parentId: null,
            parentIds: []
        })
    }

    for (const [code, dept] of departmentMap) {
        categories.push({
            id: code,
            name: dept.name,
            slug: dept.slug,
            path: dept.path,
            parentId: dept.parentId,
            parentIds: dept.parentIds
        })
    }

    for (const [code, group] of groupMap) {
        categories.push({
            id: code,
            name: group.name,
            slug: group.slug,
            path: group.path,
            parentId: group.parentId,
            parentIds: group.parentIds
        })
    }

    for (const [code, subGroup] of subGroupMap) {
        categories.push({
            id: code,
            name: subGroup.name,
            slug: subGroup.slug,
            path: subGroup.path,
            parentId: subGroup.parentId,
            parentIds: subGroup.parentIds
        })
    }

    if (categories.length > 0) {
        await DL.Category.bulkWrite({ docs: categories })
    }

    console.log(`[Comax Categories] Built ${categories.length} categories from comax products`)

    return {
        message: 'Categories built successfully',
        count: categories.length
    }
}

buildCategories.config = {
    required: [],
    permissions: ['product:update'],
    auth: 'required'
}
