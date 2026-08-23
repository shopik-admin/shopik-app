import { useUser } from 'features/User'

export default function usePermission(permission = '') {
    const user = useUser()
    if (!user) return false
    const { role = {}, isSuperAdmin } = user
    return isSuperAdmin || role.permissions?.includes(permission)
}
