import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import apiReq from '#common/functions/apiReq.js'
import { usePage } from 'layout/Page'
import { useUser } from 'features/User'
import openLoginPrompt from '#common/functions/openLoginPrompt.js'
import TR from '#common/texts/TR.js'
import ProductList, { PRODUCT_LIST_LIMIT } from 'pages/Products/ProductList'
import Button from 'common/components/Button'
import Text from 'common/components/Text'
import Flex from 'common/components/Flex'
import Icon from 'common/components/Icon'
import styles from './favorites.module.css'

export default function Favorites() {
    const { loading, pageData } = usePage()
    const navigate = useNavigate()
    const { id, favorites = [] } = useUser()
    // First page fetched after login (init only runs on path changes) or when
    // a favourite was added elsewhere while this page is mounted.
    const [data, setData] = useState(null)
    const [fetching, setFetching] = useState(false)
    const fetchedForRef = useRef('')
    const prevFavoritesRef = useRef([])
    const favoriteKey = favorites.join(',')

    const effectiveData = data || pageData?.data

    useEffect(() => {
        const prev = prevFavoritesRef.current
        prevFavoritesRef.current = favorites

        if (!id || !favorites.length) {
            fetchedForRef.current = ''
            setData(null)
            return
        }

        // Removals are handled locally by productFilter. Refetching here would
        // reset the infinite-scroll pages (and could lose already-loaded ones).
        const added = favorites.some(productId => !prev.includes(productId))
        if (prev.length && !added) return

        if (fetchedForRef.current === favoriteKey) return

        const loaded = new Set((effectiveData?.products || []).map(product => product.id))
        if (favorites.every(productId => loaded.has(productId))) {
            fetchedForRef.current = favoriteKey
            return
        }

        fetchedForRef.current = favoriteKey
        let cancelled = false
        setFetching(true)
        apiReq('product/get', {
            filter: { id: { $in: favorites } },
            limit: PRODUCT_LIST_LIMIT
        })
            .then(res => { if (!cancelled) setData(res) })
            .catch(() => { fetchedForRef.current = '' })
            .finally(() => { if (!cancelled) setFetching(false) })

        return () => { cancelled = true }
    }, [id, favoriteKey, pageData])

    if (!id) {
        return <Flex col className={styles.favorites} direction='column' gap={10}>
            <Text size='h1' bold>{TR('favorites')}</Text>
            <Flex col center gap={12} className={styles.empty}>
                <Icon name='heart' className={styles.emptyIcon} />
                <Text size='l' bold>{TR('favorites_login_prompt')}</Text>
                <Button onClick={openLoginPrompt}>{TR('login')}</Button>
            </Flex>
        </Flex>
    }

    if (!favorites.length && !loading && !fetching) {
        return <Flex col className={styles.favorites} direction='column' gap={10}>
            <Text size='h1' bold>{TR('favorites')}</Text>
            <Flex col center gap={12} className={styles.empty}>
                <Icon name='heart' className={styles.emptyIcon} />
                <Text size='l' bold>{TR('favorites_empty')}</Text>
                <Button onClick={() => navigate('/products')}>{TR('all_departments')}</Button>
            </Flex>
        </Flex>
    }

    return <ProductList
        data={effectiveData}
        loading={loading || fetching}
        title={TR('favorites')}
        resetKey='favorites'
        hideBreadcrumbs
        emptyText={TR('favorites_unavailable')}
        fetchPage={({ skip, limit }) => apiReq('product/get', {
            filter: { id: { $in: favorites } },
            skip,
            limit
        })}
        productFilter={product => favorites.includes(product.id)}
    />
}

Favorites.init = async function (url, ctx) {
    const { favoriteIds = [] } = await apiReq('user/favorites', {}, ctx)
        .catch(() => ({ favoriteIds: [] }))
    let data = { products: [], sales: {}, favoriteIds }

    if (favoriteIds.length) {
        const res = await apiReq('product/get', {
            filter: { id: { $in: favoriteIds } },
            limit: PRODUCT_LIST_LIMIT
        }, ctx).catch(() => ({ products: [], sales: {} }))
        data = { ...res, favoriteIds }
    }

    return {
        title: TR('favorites'),
        description: TR('page_favorites_desc'),
        data
    }
}
