export default async function id({ id }, { DL }) {
    return DL.SupplyArea.readById(id)
}

id.config = {
    required: ['id'],
    permissions: ['supply_area:id']
}