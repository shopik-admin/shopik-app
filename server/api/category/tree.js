export default async function getCategoryTree(payload, { DL }) {
    const categories = await DL.Category.find().sort({ name: 1 }).lean()

    function buildBranch(parentId) {
        return categories
            .filter(c => c.parentId === parentId)
            .map(child => ({
                ...child,
                children: buildBranch(child.id)
            }))
    }

    const tree = buildBranch(null)

    return { tree }
}

getCategoryTree.config = {
    required: [],
    permissions: [],
    auth: 'optional'
}
