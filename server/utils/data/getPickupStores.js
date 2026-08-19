export default async function getPickupStores({ DL }) {
    const stores = await DL.Store.read(
        { active: true, deliveryMethods: DL.Store.constants.DELIVERY_METHOD.PICKUP },
        { _id: 0, id: 1, name: 1, address: 1 })
    if (!stores) throw new Error('No stores found')
    return stores
}
