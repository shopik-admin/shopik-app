import toSlug from '#common/functions/toSlug.js'

const baseMenu = [
    {
        name: 'Home',
        path: '/'
    },
    {
        name: 'Sales',
        path: '/sales'
    }
]

export default async function getMenu({ DL }) {
    // TODO: add storeId
    const cached = await DL.redis?.get('menu')
    if (cached) {
        // return JSON.parse(cached)
    }
    const categoriesIds = await DL.Product.Model.distinct('category.pathIds', {
        status: DL.Product.constants.STATUS.ACTIVE
    })
    const categories = await DL.Category.read(
        { id: { $in: categoriesIds }, active: true },
        { _id: 0, name: 1, slug: 1, parentId: 1, id: 1 },
        { sort: { name: 1 }, limit: 0 }
    )
    const categoriesByParent = categories.reduce((acc, category) => {
        const parentId = category.parentId || null
        if (!acc[parentId]) acc[parentId] = []
        acc[parentId].push(category)
        return acc
    }, {})

    // Merge siblings by slug so two categories with the same name (different
    // ids/codes) produce a single menu entry. Children of merged duplicates
    // are collected from ALL duplicate ids and merged recursively.
    function buildBranch(parentIds, prefix = '/products') {
        const direct = parentIds.flatMap(parentId => categoriesByParent[parentId] || [])
        const bySlug = new Map()
        for (const child of direct) {
            const slug = child.slug || toSlug(child.name)
            if (!slug) continue
            if (!bySlug.has(slug)) bySlug.set(slug, { name: child.name, ids: [] })
            bySlug.get(slug).ids.push(child.id)
        }
        return [...bySlug.entries()].map(([slug, { name, ids }]) => {
            const nodePath = `${prefix}/${slug}`
            const node = { name }
            const children = buildBranch(ids, nodePath)
            if (children.length > 0) node.children = children
            return node
        })
    }

    const tree = buildBranch([null])
    const menu = [
        {
            name: 'Products',
            path: '/products',
            children: tree
        },
        ...baseMenu,
    ]
    await DL.redis?.set('menu', JSON.stringify(menu), 'EX', 60 * 60)
    return menu
}
