import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import apiReq from '#common/functions/apiReq.js'
import { usePage } from 'layout/Page'
import { useUser } from 'features/User'
import openLoginPrompt from '#common/functions/openLoginPrompt.js'
import { setSalesCache } from '#common/functions/salesCache.js'
import TR from '#common/texts/TR.js'
import ProductCard from 'pages/Products/ProductCard'
import Loader from 'common/components/Loader'
import Button from 'common/components/Button'
import Text from 'common/components/Text'
import Flex from 'common/components/Flex'
import Icon from 'common/components/Icon'
import styles from './favorites.module.css'

const EMPTY_DATA = { products: [], sales: {} }

export default function Favorites() {
    const { loading, pageData } = usePage()
    const navigate = useNavigate()
    const { id, favorites = [] } = useUser()
    // Products fetched after login (init only runs on path changes) or when a
    // favourite was added from another page while this one is mounted.
    const [fetched, setFetched] = useState(null)
    const [fetching, setFetching] = useState(false)
    // Which favourites snapshot `fetched` belongs to. Without it, favourites
    // whose products are no longer available would never satisfy the
    // "everything loaded" check and the effect would refetch forever.
    const fetchedForRef = useRef('')

    const source = fetched || pageData?.data || EMPTY_DATA
    const products = source.products || []
    const sales = source.sales || {}

    useEffect(() => {
        if (sales && Object.keys(sales).length) setSalesCache(sales)
    }, [sales])

    const favoriteKey = favorites.join(',')

    useEffect(() => {
        if (!id || !favorites.length) {
            fetchedForRef.current = ''
            setFetched(null)
            return
        }
        if (fetchedForRef.current === favoriteKey) return

        const loaded = new Set(products.map(product => product.id))
        if (favorites.every(productId => loaded.has(productId))) {
            fetchedForRef.current = favoriteKey
            return
        }

        fetchedForRef.current = favoriteKey
        let cancelled = false
        setFetching(true)
        apiReq('product/get', { filter: { id: { $in: favorites } }, limit: 100 })
            .then(res => { if (!cancelled) setFetched(res) })
            .catch(() => { fetchedForRef.current = '' })
            .finally(() => { if (!cancelled) setFetching(false) })

        return () => { cancelled = true }
    }, [id, favoriteKey, pageData])

    // Favourites order (newest first) wins over the product list's sort.
    const visible = useMemo(() => {
        const rank = new Map(favorites.map((productId, index) => [productId, index]))
        return products
            .filter(product => rank.has(product.id))
            .sort((a, b) => rank.get(a.id) - rank.get(b.id))
    }, [products, favoriteKey])

    function salesFor(product) {
        return (product.saleIds || []).reduce((acc, saleId) =>
            sales[saleId] ? { ...acc, [saleId]: sales[saleId] } : acc, {})
    }

    const busy = loading || fetching

    return <Flex col className={styles.favorites} direction='column' gap={10}>
        <Text size='h1' bold>{TR('favorites')}</Text>

        {!id ? (
            <Flex col center gap={12} className={styles.empty}>
                <Icon name='heart' className={styles.emptyIcon} />
                <Text size='l' bold>{TR('favorites_login_prompt')}</Text>
                <Button onClick={openLoginPrompt}>{TR('login')}</Button>
            </Flex>
        ) : busy ? (
            <Loader />
        ) : !visible.length ? (
            <Flex col center gap={12} className={styles.empty}>
                <Icon name='heart' className={styles.emptyIcon} />
                <Text size='l' bold>{TR('favorites_empty')}</Text>
                <Button onClick={() => navigate('/products')}>{TR('all_departments')}</Button>
            </Flex>
        ) : (
            <div className={styles.list}>
                {visible.map(product => <ProductCard
                    key={product.id}
                    product={product}
                    sales={salesFor(product)}
                />)}
            </div>
        )}
    </Flex>
}

Favorites.init = async function (url, ctx) {
    const { favoriteIds = [] } = await apiReq('user/favorites', {}, ctx)
        .catch(() => ({ favoriteIds: [] }))
    let data = { ...EMPTY_DATA, favoriteIds }

    if (favoriteIds.length) {
        const res = await apiReq('product/get', {
            filter: { id: { $in: favoriteIds } },
            limit: 100
        }, ctx).catch(() => EMPTY_DATA)
        data = { ...res, favoriteIds }
    }

    return {
        title: TR('favorites'),
        description: TR('page_favorites_desc'),
        data
    }
}
