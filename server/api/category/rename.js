import { buildRenamePlan, normalizeCategoryName } from '#server/services/categoryMap/index.js'
import { invalidateMenu } from '#server/utils/data/getMenu.js'

const CATEGORY_FIELDS = { _id: 0, id: 1, name: 1, code: 1, slug: 1, path: 1, level: 1, parentId: 1 }

/**
 * Rename a category: new name, new slug, new path for the category and for
 * every category below it, and the denormalized title on its products.
 *
 * The id (nc:<code>:...) is untouched, so the CSV export/map keep working and
 * products only need their title refreshed.
 */
export default async function renameCategory({ id, name }, { DL }) {
    if (!id) throw { status: 400, message: 'id required' }
    const title = normalizeCategoryName(name)

    // The whole tree is needed to keep slugs unique per parent and to recompute
    // the paths below the renamed category.
    const categories = await DL.Category.read({}, CATEGORY_FIELDS, { limit: 0 })
    const plan = buildRenamePlan({ categories: categories || [], id: String(id), name: title })
    if (!plan) throw { status: 404, message: 'category not found' }

    let products = 0
    if (plan.updates.length) {
        await DL.Category.Model.bulkWrite(plan.updates.map(update => {
            // Descendants only get a new path; name/slug are set on the renamed
            // category itself.
            const $set = { path: update.path }
            if (update.name !== undefined) $set.name = update.name
            if (update.slug !== undefined) $set.slug = update.slug

            return { updateOne: { filter: { id: update.id }, update: { $set } } }
        }))

        // bulkWrite bypasses the DL cache; sync the touched docs.
        const updated = await DL.Category.Model.find(
            { id: { $in: plan.updates.map(update => update.id) } },
            { _id: 0 }
        ).lean()
        await DL.Category.cache.add(updated)

        // Products carry the title of the category they are mapped to. Products
        // of a sub-category keep their own leaf title and are not matched here.
        const res = await DL.Product.Model.updateMany(
            { 'category.id': String(id) },
            { $set: { 'category.title': title } }
        )
        products = res?.modifiedCount ?? 0
    }

    await invalidateMenu({ DL })

    return {
        ok: true,
        id: String(id),
        name: plan.name,
        slug: plan.slug,
        path: plan.path,
        categories: plan.updates.length,
        products
    }
}

renameCategory.config = {
    required: ['id', 'name'],
    permissions: ['category:update']
}
