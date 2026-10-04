import { createContext, useContext, useState } from 'react'
import apiReq from '#common/functions/apiReq.js'

const UserContext = createContext()
export const useUser = () => useContext(UserContext)

export default function User({ children, sdUser }) {
    const [user, setUser] = useState(sdUser)

    async function logout() {
        await apiReq('admin/logout')
        location.reload()
    }

    async function setCurrentStore(storeId) {
        const res = await apiReq('admin/current_store', { storeId })
        const currentStoreId = res?.currentStoreId || storeId
        setUser(prev => ({ ...prev, currentStoreId }))
        return currentStoreId
    }

    return user.id ?
        <UserContext.Provider value={{ ...user, logout, setCurrentStore }} >
            {children}
        </UserContext.Provider> : null

}