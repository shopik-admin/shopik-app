import diff from '#common/functions/diff.js'
import { validateSalePrice } from '#server/utils/data/validateSalePrice.js'

export default async function update(payload, { DL, _admin }) {
    const { id } = payload

    const sale = await DL.Sale.readById(id)
    if (!sale) throw { status: 400, message: 'sale does not exist' }

    const update = diff(sale, payload)
    const nothingToUpdate = Object.keys(update).length === 0
    if (nothingToUpdate) return sale

    await validateSalePrice({
        kind: update.kind ?? sale.kind,
        price: update.price ?? sale.price,
        amount: update.amount ?? sale.amount,
        barcodes: update.barcodes ?? sale.barcodes
    }, { DL })

    const updated = await DL.Sale.updateOne({ id }, update)
    return updated
}

update.config = {
    required: ['id'],
    permissions: ['sale:update']
}
