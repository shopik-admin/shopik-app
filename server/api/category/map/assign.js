import { applyCategoryFlagStatuses, metadataForCode } from '#server/services/categoryMap/index.js'
import { invalidateMenu } from '#server/utils/data/getMenu.js'
import { scanDel } from '#server/utils/data/displayBlocks.js'

export default async function assign({ subGroupCode, categoryId }, { DL }) {
    const code = String(subGroupCode ?? '').trim()
    if (!code) throw { status: 400, message: 'subGroupCode required' }

    let category = null
    if (categoryId) {
        category = await DL.Category.readOne(
            { id: String(categoryId), active: true },
            { _id: 0, id: 1, name: 1, parentIds: 1, active: 1 }
        )
        if (!category) throw { status: 400, message: 'category not found' }
    }

    const existing = await DL.CategoryMap.readOne(
        { subGroupCode: code },
        { _id: 0, subGroupCode: 1, categoryId: 1, categoryActive: 1 }
    )
    const metadata = existing || await metadataForCode(DL, code)
    // A sub-group assigned to an inactive category is hidden from the site, and
    // inherits the mirror flag immediately instead of waiting for the next sweep.
    const categoryActive = category ? category.active !== false : true
    const wasActive = existing ? existing.categoryActive !== false : true

    await DL.CategoryMap.bulkWrite({
        docs: [{
            ...metadata,
            subGroupCode: code,
            categoryId: category?.id || null,
            categoryActive
        }],
        getFilter: doc => ({ subGroupCode: doc.subGroupCode }),
        getUpsert: () => true
    })

    // Re-point every product of this sub-group so the storefront menu and
    // category pages reflect the change immediately.
    if (category) {
        await DL.Product.Model.updateMany(
            { comaxSubGroupCode: code },
            {
                $set: {
                    category: {
                        id: category.id,
                        title: category.name,
                        pathIds: [...(category.parentIds || []), category.id]
                    }
                }
            }
        )
    } else {
        await DL.Product.Model.updateMany(
            { comaxSubGroupCode: code },
            { $unset: { category: '' } }
        )
    }

    // Only a flag flip changes product statuses: hide right away when the new
    // category is inactive, and run the un-hide ladder when it became active.
    let status = null
    if (categoryActive !== wasActive) {
        if (categoryActive) {
            status = await applyCategoryFlagStatuses({ DL, relaxCodes: [code] })
        } else {
            const { ACTIVE, HIDDEN } = DL.Product.constants.STATUS
            await DL.Product.update(
                { comaxSubGroupCode: code, status: ACTIVE },
                { status: HIDDEN }
            )
        }
    }

    await invalidateMenu({ DL })
    if (categoryActive !== wasActive && DL.redis)
        await scanDel(DL.redis, 'display:*')

    return {
        ok: true,
        subGroupCode: code,
        categoryId: category?.id || null,
        categoryActive,
        hidden: status?.hidden ?? 0,
        unhidden: status?.unhidden ?? 0
    }
}

assign.config = {
    required: ['subGroupCode'],
    permissions: ['category:update']
}
