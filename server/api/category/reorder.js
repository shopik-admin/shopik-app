import { invalidateMenu } from '#server/utils/data/getMenu.js'

export default async function reorder({ parentId = null, orderedIds }, { DL }) {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0)
        throw { status: 400, message: 'orderedIds required' }

    const parent = parentId || null
    const ids = orderedIds.map(String)
    const categories = await DL.Category.read(
        { id: { $in: ids } },
        { _id: 0, id: 1, parentId: 1 },
        { limit: 0 }
    )
    if (categories.length !== ids.length)
        throw { status: 400, message: 'unknown category ids' }
    if (categories.some(category => (category.parentId || null) !== parent))
        throw { status: 400, message: 'categories must share the same parent' }

    await DL.Category.Model.bulkWrite(ids.map((id, index) => ({
        updateOne: { filter: { id }, update: { $set: { sortOrder: index } } }
    })))

    // findOneAndUpdate/bulkWrite bypass the DL cache; sync the touched docs.
    const updated = await DL.Category.Model.find({ id: { $in: ids } }, { _id: 0 }).lean()
    await DL.Category.cache?.add(updated)
    await invalidateMenu({ DL })

    return { ok: true, count: ids.length }
}

reorder.config = {
    required: ['orderedIds'],
    permissions: ['category:update']
}
