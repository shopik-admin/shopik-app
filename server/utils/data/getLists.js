import storeScope from '#server/utils/data/storeScope.js'

export default async function getLists({ DL }, user) {
    const { roleId } = user
    const [roles, domains, stores, scope] = await Promise.all([
        DL.Role.read({
            $or: [
                { parentIds: roleId },
                { id: roleId }
            ]
        }, { id: 1, name: 1 }, { limit: 0 }),
        DL.Domain.read({}, { id: 1, name: 1, isDefault: 1 }, { limit: 0 }),
        DL.Store.read({}, { id: 1, name: 1, address: 1 }, { limit: 0 }),
        storeScope({ DL, _admin: user })
    ])
    const lists = {}
    lists.roles = roles.map(({ id, name }) => ({ value: id, text: name }))
    lists.domains = domains.map(({ id, name, isDefault }) => ({ value: id, text: name, isDefault: !!isDefault }))
    const visibleStores = scope === null ? stores : stores.filter(s => scope.includes(s.id))
    lists.stores = visibleStores.map(({ id, name, address }) => ({ value: id, text: name, address }))
    lists.saleTypes = Object.values(DL.Sale.constants.TYPES)
    lists.saleKinds = Object.values(DL.Sale.constants.KINDS)
    lists.couponDepartments = Object.values(DL.Coupon.constants.DEPARTMENTS)
    lists.couponBenefits = Object.values(DL.Coupon.constants.BENEFITS)
    return lists
}