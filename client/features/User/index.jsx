import { createContext, useContext, useState } from 'react'
import apiReq from '#common/functions/apiReq.js'
import openLoginPrompt from '#common/functions/openLoginPrompt.js'
import { useOrder } from '../Order/OrderProvider'

const UserContext = createContext({})
export const useUser = () => useContext(UserContext)

export default function User({ children, sdUser = {} }) {
    const [user, setUser] = useState(sdUser)
    // Favourites live in their own collection (user_favorite); SSR injects the
    // ids into sdUser.favorites so hearts are correct on first paint.
    const [favorites, setFavorites] = useState(() =>
        Array.isArray(sdUser?.favorites) ? sdUser.favorites : []
    )
    const { setOrder, queueCartSync } = useOrder()

    async function logout() {
        await apiReq('user/logout')
        setUser({})
        setFavorites([])
        setOrder(null)
    }

    async function refreshFavorites() {
        try {
            const res = await apiReq('user/favorites')
            const ids = Array.isArray(res?.favoriteIds) ? res.favoriteIds : []
            setFavorites(ids)
            return ids
        } catch {
            return null
        }
    }

    function onLogin({ user, order }) {
        if (user?.id) {
            setUser(user)
            // The login response only carries the user document; favourites
            // are a separate collection, so hydrate them after login.
            refreshFavorites()
            // Server wins: replay the device cart only when the server order
            // is empty (covers device carts orphaned without a guest cookie,
            // which the server-side guest merge can't see). Read before
            // removeItem; sync failures keep the previous state.
            if (!order?.cart?.length) {
                try {
                    const parsed = JSON.parse(localStorage.cart || 'null')
                    if (Array.isArray(parsed)) {
                        for (const item of parsed) {
                            const amount = Number(item?.amount) || 0
                            if (item?.id && amount > 0) queueCartSync(item, amount)
                        }
                    }
                } catch { }
            }
            localStorage.removeItem('cart')
        }
        if (order)
            setOrder(order)
    }

    async function userEdit(newData) {
        const res = await apiReq('user/edit', newData)
        setUser({ ...user, ...res.user })
        return res
    }

    async function addressEdit(newData) {
        const res = await apiReq('user/address/edit', newData)
        setUser({ ...user, ...res.user })
        return true
    }

    function isFavorite(productId) {
        return !!productId && favorites.includes(String(productId))
    }

    async function toggleFavorite(productId) {
        const id = String(productId || '')
        if (!id) return false

        if (!user?.id) {
            openLoginPrompt()
            return false
        }

        const wasFavorite = favorites.includes(id)
        const previous = favorites
        // Optimistic: the heart fills/empties on press, then the server list
        // becomes the source of truth (rollback on failure).
        setFavorites(wasFavorite
            ? favorites.filter(fav => fav !== id)
            : [id, ...favorites])

        try {
            const res = await apiReq('user/favorite', { productId: id })
            if (Array.isArray(res?.favoriteIds)) setFavorites(res.favoriteIds)
            return !wasFavorite
        } catch (e) {
            setFavorites(previous)
            throw e
        }
    }

    return <UserContext.Provider value={{
        ...user,
        favorites,
        isFavorite,
        toggleFavorite,
        refreshFavorites,
        setUser,
        onLogin,
        logout,
        userEdit,
        addressEdit
    }} >
        {children}
    </UserContext.Provider >

}