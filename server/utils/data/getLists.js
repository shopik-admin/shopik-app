export default async function getLists({ DL }) {
    const [roles, domains, stores] = await Promise.all([
        DL.Role.read({}, { id: 1, name: 1 }, { limit: 0 }),
        DL.Domain.read({}, { id: 1, name: 1 }, { limit: 0 }),
        DL.Store.read({}, { id: 1, name: 1 }, { limit: 0 })
    ])
    const lists = {}
    lists.roles = roles.map(({ id, name }) => ({ value: id, text: name }))
    lists.domains = domains.map(({ id, name }) => ({ value: id, text: name }))
    lists.stores = stores.map(({ id, name }) => ({ value: id, text: name }))
    lists.saleTypes = Object.values(DL.Sale.constants.TYPES)
    lists.saleKinds = Object.values(DL.Sale.constants.KINDS)
    lists.couponDepartments = Object.values(DL.Coupon.constants.DEPARTMENTS)
    lists.couponBenefits = Object.values(DL.Coupon.constants.BENEFITS)
    return lists
}