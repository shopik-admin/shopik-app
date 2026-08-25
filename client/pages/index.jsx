import Products from './Products'
import Account from './Account'
import Home from './Home'
import Product from './Product'
import Checkout from './Checkout'
import Search from './Search'

export default [
    {
        path: '/',
        element: Home,
        title: 'דף הבית',
        description: 'ברוכים הבאים'
    },
    {
        path: '/products/*',
        element: Products,
        title: 'מוצרים',
        description: 'קטלוג מוצרים'
    },
    {
        path: '/search',
        element: Search,
        title: 'חיפוש',
        description: 'חיפוש מוצרים'
    },
    {
        path: '/account/*',
        element: Account,
        title: 'אזור אישי',
        description: 'ניהול החשבון שלי'
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
        description: 'מעבר לתשלום'
    }
]
