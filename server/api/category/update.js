import { invalidateMenu } from '#server/utils/data/getMenu.js'
import { deleteIcon } from '#server/services/categoryIcon.js'
import { scanDel } from '#server/utils/data/displayBlocks.js'
import {
    applyCategoryFlagStatuses,
    descendantIds,
    mirrorCategoryActive
} from '#server/services/categoryMap/index.js'

export default async function update({ id, icon, active }, { DL }) {
    if (!id) throw { status: 400, message: 'id required' }

    const hasIcon = icon !== undefined
    const hasActive = active !== undefined
    if (!hasIcon && !hasActive)
        throw { status: 400, message: 'nothing to update' }

    const previous = await DL.Category.readById(id)
    if (!previous) throw { status: 404, message: 'category not found' }

    // The active checkbox covers the whole branch: descendants inherit the
    // state, so deactivating a parent hides its sub-categories too.
    let ids = []
    if (hasActive) {
        const categories = await DL.Category.read(
            {},
            { _id: 0, id: 1, parentIds: 1 },
            { limit: 0 }
        )
        ids = descendantIds(categories || [], id)
        await DL.Category.update({ id: { $in: ids } }, { active: Boolean(active) })
    }

    if (hasIcon) {
        const updated = await DL.Category.updateOne(
            { id },
            { icon: icon ? String(icon) : '' }
        )
        if (!updated) throw { status: 404, message: 'category not found' }

        // Removing/replacing an uploaded icon must also free the stored file.
        if (previous?.icon && previous.icon !== updated.icon)
            await deleteIcon(previous.icon)
    }

    const category = await DL.Category.readById(id)
    if (!category) throw { status: 404, message: 'category not found' }

    // Mirror the new state onto this branch's sub-groups, then sweep product
    // statuses in both directions. `showOnSite` stays untouched, so a sub-group
    // Comax hid permanently is never resurrected by reactivating a category.
    let status = null
    if (hasActive) {
        const mirror = await mirrorCategoryActive({ DL, categoryIds: ids })
        status = await applyCategoryFlagStatuses({ DL, relaxCodes: mirror.relaxed })
    }

    await invalidateMenu({ DL })
    if (status?.toWrite && DL.redis)
        await scanDel(DL.redis, 'display:*')

    return {
        ...category,
        cascaded: ids.length,
        hidden: status?.hidden ?? 0,
        unhidden: status?.unhidden ?? 0
    }
}

update.config = {
    required: ['id'],
    permissions: ['category:update']
}
