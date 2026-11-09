import { categorySlug } from './parse.js'

// Mirrors the category schema (name: required, trim, minlength 2, maxlength 100)
// so a bad name fails here with a readable message instead of in mongoose.
const NAME_MIN = 2
const NAME_MAX = 100

export function normalizeCategoryName(name) {
    const value = String(name ?? '').trim()
    if (value.length < NAME_MIN)
        throw { status: 400, message: `category name must be at least ${NAME_MIN} characters` }
    if (value.length > NAME_MAX)
        throw { status: 400, message: `category name must be at most ${NAME_MAX} characters` }
    return value
}

/**
 * What a rename changes: the category's own slug/path and name, and the stored
 * `path` of every descendant (their slugs stay as they are).
 *
 * Returns null when the id is unknown, and `updates: []` when the new name
 * produces the same slug and the same paths, so the caller can skip the write.
 */
export function buildRenamePlan({ categories = [], id, name }) {
    const byId = new Map(categories.map(category => [category.id, category]))
    const target = byId.get(id)
    if (!target) return null

    const parent = target.parentId ? byId.get(target.parentId) : null
    const siblings = categories.filter(category =>
        (category.parentId || null) === (target.parentId || null) && category.id !== target.id)

    const slug = categorySlug(name, target.code, new Set(siblings.map(category => category.slug).filter(Boolean)))
    const path = parent?.path ? `${parent.path}/${slug}` : slug

    const childrenByParent = new Map()
    for (const category of categories) {
        const key = category.parentId || null
        if (!childrenByParent.has(key)) childrenByParent.set(key, [])
        childrenByParent.get(key).push(category)
    }

    const updates = [{ id: target.id, name, slug, path }]
    const walk = (node, parentPath) => {
        const children = childrenByParent.get(node.id) || []
        // Only needed when a stored slug is missing, but keeping the siblings'
        // slugs out of the way guarantees two children never share a path.
        const used = new Set(children.map(child => child.slug).filter(Boolean))

        for (const child of children) {
            const childSlug = child.slug || categorySlug(child.name, child.code, used)
            const childPath = `${parentPath}/${childSlug}`
            if (child.path !== childPath) updates.push({ id: child.id, path: childPath })
            walk(child, childPath)
        }
    }
    walk(target, path)

    // Nothing actually moves when the name changed but the slug (and with it
    // every path below it) stayed the same.
    const unchanged = updates.length === 1 &&
        target.name === name && target.slug === slug && target.path === path

    return { name, slug, path, updates: unchanged ? [] : updates }
}
