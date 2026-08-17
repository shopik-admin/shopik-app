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
    const categoriesIds = await DL.Product.Model.distinct('category.pathIds', {
        status: DL.Product.constants.STATUS.ACTIVE
    })
    const categories = await DL.Category.read(
        { id: { $in: categoriesIds } },
        { _id: 0, name: 1, parentId: 1, id: 1 },
        { sort: { name: 1 }, limit: 0 }
    )
    const categoriesByParent = categories.reduce((acc, category) => {
        const parentId = category.parentId || null
        if (!acc[parentId]) acc[parentId] = []
        acc[parentId].push(category)
        return acc
    }, {})

    function buildBranch(parentId, prefix = '/products', encodedPrefix = '/products') {
        return categoriesByParent[parentId]?.map(child => {
            const path = `${prefix}/${child.name}`.replace(/\s+/g, '-').toLowerCase()
            const encodedPath = `${encodedPrefix}/${encodeURIComponent(child.name)}`.replace(/\s+/g, '-').toLowerCase()
            const node = {
                id: child.id,
                name: child.name,
                path,
                encodedPath
            }
            const children = buildBranch(child.id, path, encodedPath)
            if (children?.length > 0)
                node.children = children

            return node
        })
    }

    const tree = buildBranch(null)
    const menu = [
        ...baseMenu,
        {
            name: 'Products',
            path: '/products',
            children: tree
        }
    ]
    return menu
}
