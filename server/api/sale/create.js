import { validateSalePrice } from '#server/utils/data/validateSalePrice.js'

export default async function create(payload, { DL }) {
    await validateSalePrice(payload, { DL })
    const created = await DL.Sale.create(payload)
    return created
}

create.config = {
    permissions: ['sale:create']
}
