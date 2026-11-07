import { metadataForCode } from '#server/services/categoryMap/index.js'
import { invalidateMenu } from '#server/utils/data/getMenu.js'

export default async function assign({ subGroupCode, categoryId }, { DL }) {
    const code = String(subGroupCode ?? '').trim()
    if (!code) throw { status: 400, message: 'subGroupCode required' }

    let category = null
    if (categoryId) {
        category = await DL.Category.readOne(
            { id: String(categoryId), active: true },
            { _id: 0, id: 1, name: 1, parentIds: 1 }
        )
        if (!category) throw { status: 400, message: 'category not found' }
    }

    const existing = await DL.CategoryMap.readOne(
        { subGroupCode: code },
        { _id: 0, subGroupCode: 1, categoryId: 1 }
    )
    const metadata = existing || await metadataForCode(DL, code)

    await DL.CategoryMap.bulkWrite({
        docs: [{ ...metadata, subGroupCode: code, categoryId: category?.id || null }],
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

    await invalidateMenu({ DL })
    return { ok: true, subGroupCode: code, categoryId: category?.id || null }
}

assign.config = {
    required: ['subGroupCode'],
    permissions: ['category:update']
}
