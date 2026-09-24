import Products from './Products'
import Sales from './Sales'
import Account from './Account'
import Home from './Home'
import Product from './Product'
import Carousel from './Carousel'
import Checkout from './Checkout'
import Search from './Search'
import Terms from './Terms'
import Privacy from './Privacy'
import NotFound from './NotFound'
import TR from '#common/texts/TR.js'

export default [
    {
        path: '/',
        element: Home,
        title: TR('page_home_title'),
        description: TR('page_home_desc')
    },
    {
        path: '/products/*',
        element: Products,
        title: TR('products'),
        description: TR('page_products_desc')
    },
    {
        path: '/sales',
        element: Sales,
        title: TR('sales'),
        description: TR('page_sales_desc')
    },
    {
        path: '/search',
        element: Search,
        title: TR('search'),
        description: TR('page_search_desc')
    },
    {
        path: '/account/*',
        element: Account,
        title: TR('page_account_title'),
        description: TR('page_account_desc')
    },
    {
        path: 'product/:productId',
        element: Product,
        title: TR('product'),
        description: TR('page_product_desc')
    },
    {
        path: 'carousel/:carouselId',
        element: Carousel,
        title: TR('page_catalog_title'),
        description: TR('products')
    },
    {
        path: 'checkout',
        element: Checkout,
        title: TR('page_checkout_title'),
        description: TR('page_checkout_desc')
    },
    {
        path: 'terms',
        element: Terms,
        title: TR('info_terms'),
        description: TR('page_terms_desc')
    },
    {
        path: 'privacy',
        element: Privacy,
        title: TR('info_privacy'),
        description: TR('page_privacy_desc')
    },
    {
        path: '*',
        element: NotFound,
        title: '404'
    }
]
