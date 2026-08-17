import { createContext, useContext, useState } from 'react'

const UserContext = createContext()
export const useUser = () => useContext(UserContext)

export default function User({ children, sdUser }) {
    const [user, setUser] = useState(sdUser)

    function logout() { }

    return user.id ?
        <UserContext.Provider value={{ ...user, logout }} >
            {children}
        </UserContext.Provider> : null

}