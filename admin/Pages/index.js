import Permissions from 'Pages/Permissions'
import Dashboard from 'Pages/Dashboard'
import { useUser } from 'features/User'
import Settings from 'Pages/Settings'
import Products from 'Pages/Products'
import Admins from 'Pages/Admins'
import Stores from 'Pages/Stores'
import Domains from 'Pages/Domains'
import Orders from 'Pages/Orders'
import Users from 'Pages/Users'
import Logs from 'Pages/Logs'
import Sales from 'Pages/Sales'
import Coupons from 'Pages/Coupons'
import ComaxProducts from 'Pages/ComaxProducts'
import ComaxSales from 'Pages/ComaxSales'
import SupplyAreas from 'Pages/SupplyAreas'

const pages = [
    { key: 'dashboard', name: 'Dashboard', path: '/admin/', section: 'main', icon: 'desktop', component: Dashboard,/*  permission: 'dashboard:read' */ },

    { key: 'products', name: 'Products', path: '/admin/products', section: 'content', icon: 'products', component: Products, permission: 'product:read' },
    { key: 'users', name: 'users', path: '/admin/users', section: 'content', icon: 'users', component: Users, permission: 'user:read' },
    { key: 'orders', name: 'orders', path: '/admin/orders', section: 'content', icon: 'orders', component: Orders, permission: 'order:read' },
    { key: 'sales', name: 'Sales', path: '/admin/sales', section: 'content', icon: 'sale', component: Sales, permission: 'sale:read' },
    { key: 'coupons', name: 'Coupons', path: '/admin/coupons', section: 'content', icon: 'coupon', component: Coupons, permission: 'coupon:read' },

    { key: 'admins', name: 'Admins', path: '/admin/admins', section: 'management', icon: 'persons', component: Admins, permission: 'admin:read' },
    { key: 'domains', name: 'Domains', path: '/admin/domains', section: 'management', icon: 'domains', component: Domains, permission: 'domain:read' },
    { key: 'stores', name: 'Stores', path: '/admin/stores', section: 'management', icon: 'stores', component: Stores, permission: 'store:read' },

    { key: 'comax-products', name: 'Comax Products', path: '/admin/comax-products', section: 'comax', icon: 'products', component: ComaxProducts, permission: 'comax_product:read' },
    { key: 'comax-sales', name: 'Comax Sales', path: '/admin/comax-sales', section: 'comax', icon: 'sale', component: ComaxSales, permission: 'comax_sale:read' },

    { key: 'logs', name: 'Logs', path: '/admin/logs', section: 'system', icon: 'log', component: Logs, permission: 'log:read' },
    { key: 'supply-areas', name: 'Supply Areas', path: '/admin/supply-areas', section: 'management', icon: 'map', component: SupplyAreas, permission: 'supply_area:read' },
    { key: 'permissions', name: 'permissions', path: '/admin/permissions', section: 'system', icon: 'key', component: Permissions, permission: 'permission:read' },
    { key: 'settings', name: 'Settings', path: '/admin/settings', section: 'system', icon: 'settings', component: Settings, permission: 'setting:read' },
]

export default function usePages() {
    const { isSuperAdmin, permissions } = useUser()

    if (isSuperAdmin)
        return pages

    return pages.filter(p => permissions.includes(p.permission))
} 