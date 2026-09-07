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

    return user.id ?
        <UserContext.Provider value={{ ...user, logout }} >
            {children}
        </UserContext.Provider> : null

}