import { lazy } from 'react'
import Products from './Products'
import Home from './Home'
import Product from './Product'
import Search from './Search'
import NotFound from './NotFound'

const Account = lazy(() => import('./Account'))
const Checkout = lazy(() => import('./Checkout'))

export default [
    {
        path: '/',
        element: Home,
        title: 'דף הבית',
        description: 'חנות אונליין'
    },
    {
        path: '/products/*',
        element: Products,
        title: 'מוצרים',
        description: 'רשימת מוצרים'
    },
    {
        path: '/search',
        element: Search,
        title: 'חיפוש',
        description: 'חיפוש מוצרים',
        noindex: true
    },
    {
        path: '/account/*',
        element: Account,
        title: 'אזור אישי',
        description: 'עמוד פרטים אישיים',
        noindex: true
    },
    {
        path: 'product/:productId',
        element: Product,
        title: 'מוצר',
        description: 'דף מוצר'
    },
    {
        path: 'checkout',
        element: Checkout,
        title: 'קופה',
        description: 'סיום הזמנה',
        noindex: true
    },
    {
        path: '*',
        element: NotFound,
        title: '404'
    }
]
