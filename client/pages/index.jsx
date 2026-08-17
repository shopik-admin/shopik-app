import Products from './Products'
import Home from './Home'

export default [
    {
        path: '/',
        element: <Home />,
        title: 'דף הבית',
        description: 'ברוכים הבאים'
    },
    {
        path: '/products',
        element: <Products />,
        title: 'מוצרים',
        description: 'קטלוג מוצרים'
    },
]