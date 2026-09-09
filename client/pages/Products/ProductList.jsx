import { useEffect, useRef, useState } from 'react'
import Breadcrumbs from 'components/Breadcrumbs'
import Loader from '#common/components/Loader'
import styles from './products.module.css'
import Flex from '#common/components/Flex'
import Text from '#common/components/Text'
import ProductCard from './ProductCard'
import NotFound from 'pages/NotFound'
import DisplayBlocks from 'features/Display/DisplayBlocks'
import { setSalesCache } from '#common/functions/salesCache.js'

export const PRODUCT_LIST_LIMIT = 30

export default function ProductList({ data, loading, notFound, title, breadcrumbPath, resetKey, fetchPage, emptyText, hideBreadcrumbs, blocks }) {
    const [extra, setExtra] = useState([])
    const [hasMore, setHasMore] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const latestRequest = useRef(0)
    const sentinelRef = useRef(null)

    const products = [...(data?.products || []), ...extra.flatMap(e => e.products)]
    const sales = extra.reduce((acc, e) => ({ ...acc, ...e.sales }), data?.sales || {})
    useEffect(() => { if (sales && Object.keys(sales).length) setSalesCache(sales) }, [sales])

    // NOTE: data can arrive AFTER resetKey changes (client-side navigation keeps
    // the previous page's data while init runs — e.g. Home has no products).
    // Recomputing when the incoming snapshot changes un-sticks hasMore. The
    // fingerprint (count + first id) also catches same-count product swaps.
    const incomingCount = data?.products?.length || 0
    const incomingFirstId = data?.products?.[0]?.id || ''
    useEffect(() => {
        ++latestRequest.current
        setExtra([])
        setHasMore(incomingCount === PRODUCT_LIST_LIMIT)
        setLoadingMore(false)
    }, [resetKey, incomingCount, incomingFirstId])

    async function loadMore() {
        if (loadingMore || !hasMore) return
        const reqId = ++latestRequest.current
        setLoadingMore(true)
        try {
            const res = await fetchPage({ skip: products.length, limit: PRODUCT_LIST_LIMIT })
            if (reqId !== latestRequest.current) return
            setExtra(prev => [...prev, res])
            setHasMore(res.products.length === PRODUCT_LIST_LIMIT)
        } catch {
            if (reqId === latestRequest.current) setHasMore(false)
        } finally {
            if (reqId === latestRequest.current) setLoadingMore(false)
        }
    }

    useEffect(() => {
        const el = sentinelRef.current
        if (!el || !hasMore || loading) return
        const io = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) loadMore()
        }, { rootMargin: '400px' })
        io.observe(el)
        return () => io.disconnect()
    }, [hasMore, loadingMore, loading, resetKey])

    if (notFound) return <NotFound />

    return <Flex col className={styles.products} direction='column' gap={10}>
        {!!blocks?.length &&
            <DisplayBlocks blocks={blocks} />
        }
        <div className={styles.headerText}>
            {!hideBreadcrumbs && <Breadcrumbs path={breadcrumbPath} hideLast />}
            <Text size='h1' bold>{title}</Text>
        </div>
        <div className={styles.list}>
            {loading ? <Loader />
                : products.map(p => <ProductCard
                    key={p.id}
                    product={p}
                    sales={(p.saleIds || []).reduce((acc, sId) => sales[sId] ? { ...acc, [sId]: sales[sId] } : acc, {})}
                />)}
        </div>
        {!loading && products.length === 0 && emptyText && <Text>{emptyText}</Text>}
        {!loading && hasMore && <div ref={sentinelRef} className={styles.sentinel} />}
        {loadingMore && <Loader />}
    </Flex>
}
