import { invalidateMenu } from '#server/utils/data/getMenu.js'
import { deleteIcon } from '#server/services/categoryIcon.js'

export default async function update({ id, icon, active }, { DL }) {
    if (!id) throw { status: 400, message: 'id required' }

    const update = {}
    if (icon !== undefined) update.icon = icon ? String(icon) : ''
    if (active !== undefined) update.active = Boolean(active)
    if (!Object.keys(update).length)
        throw { status: 400, message: 'nothing to update' }

    const previous = await DL.Category.readById(id)
    const category = await DL.Category.updateOne({ id }, update)
    if (!category) throw { status: 404, message: 'category not found' }

    // Removing/replacing an uploaded icon must also free the stored file.
    if (update.icon !== undefined && previous?.icon && previous.icon !== category.icon)
        await deleteIcon(previous.icon)

    await invalidateMenu({ DL })
    return category
}

update.config = {
    required: ['id'],
    permissions: ['category:update']
}
