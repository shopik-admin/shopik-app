import usePermission from './usePermission'

export default function PermissionZone({ name = '', children }) {
    const permission = usePermission(name)
    return permission ? children : null
}
