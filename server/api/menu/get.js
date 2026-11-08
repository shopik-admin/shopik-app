import getMenu from '#server/utils/data/getMenu.js'

/**
 * The storefront menu of the caller's store.
 *
 * SSR already sends it in the app payload, so this exists for the one thing a
 * page load cannot cover: an in-app store change (address change, pickup store
 * switch, logout) moves the cart order to another store, and the menu is
 * filtered by store. Re-fetching it keeps the header/drawer categories in step
 * without reloading the page the shopper is standing in.
 */
export default async function get(payload, { DL, req, _user, utils }) {
    return { menu: await getMenu({ DL, req, _user, utils }) }
}

// Guests get the store-less menu, logged-in shoppers get their store's menu:
// getMenu resolves the store itself from the session or the guest cart cookie.
get.config = {
    auth: 'lax'
}
