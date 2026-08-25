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
        return JSON.parse(cached)
    }
    const categoriesIds = await DL.Product.Model.distinct('category.pathIds', {
        status: DL.Product.constants.STATUS.ACTIVE
    })
    const categories = await DL.Category.read(
        { id: { $in: categoriesIds }, active: true },
        { _id: 0, name: 1, parentId: 1, id: 1 },
        { sort: { name: 1 }, limit: 0 }
    )
    const categoriesByParent = categories.reduce((acc, category) => {
        const parentId = category.parentId || null
        if (!acc[parentId]) acc[parentId] = []
        acc[parentId].push(category)
        return acc
    }, {})

    function buildBranch(parentId, prefix = '/products') {
        return categoriesByParent[parentId]?.map(child => {
            const node = {
                name: child.name
            }
            const children = buildBranch(child.id, `${prefix}/${toSlug(child.name)}`)
            if (children?.length > 0)
                node.children = children

            return node
        })
    }

    const tree = buildBranch(null)
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
