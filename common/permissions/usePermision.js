import { useUser } from 'features/User'

export default function usePermission(permission = '') {
    const { role = {}, isSuperAdmin } = useUser()
    return isSuperAdmin || role.permissions.includes(permission)
}
