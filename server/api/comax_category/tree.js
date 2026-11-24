import { buildCategoryTree } from '#server/services/comaxCategorySettings/tree.js'

export default async function tree(payload, { DL }) {
    return buildCategoryTree({ DL })
}

tree.config = {
    permissions: ['comax_product:read']
}
