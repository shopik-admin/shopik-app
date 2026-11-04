// One document per favourited product. Kept out of the user document so a
// heart toggle never invalidates the cached user_auth:<id> entry and so
// favourites can later be queried by product (stock alerts, popularity).
const userFavoriteSchema = {
    userId: { type: String, required: true, filter: true },
    domainId: { type: String, filter: true },
    productId: { type: String, required: true, filter: true },
    addedAt: { type: Date, default: Date.now }
}

export const meta = {
    index: [
        [{ userId: 1, productId: 1 }, { unique: true }],
        [{ productId: 1 }],
        [{ userId: 1, addedAt: -1 }]
    ]
}

export default userFavoriteSchema
