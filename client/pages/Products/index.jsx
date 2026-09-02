import { useEffect, useRef, useState } from 'react'
import Breadcrumbs from 'components/Breadcrumbs'
import Loader from '#common/components/Loader'
import apiReq from '#common/functions/apiReq'
import styles from './products.module.css'
import Flex from '#common/components/Flex'
import Text from '#common/components/Text'
import ProductCard from './ProductCard'
import NotFound from 'pages/NotFound'
import { usePage } from 'layout/Page'
import { setSalesCache } from '#common/functions/salesCache.js'

const LIMIT = 30

export default function Products() {
    const { loading, pageData, path } = usePage()
    const data = pageData?.data
    const [extra, setExtra] = useState([])
    const [hasMore, setHasMore] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const latestRequest = useRef(0)
    const sentinelRef = useRef(null)

    const products = [...(data?.products || []), ...extra.flatMap(e => e.products)]
    const sales = extra.reduce((acc, e) => ({ ...acc, ...e.sales }), data?.sales || {})
    useEffect(() => { if (sales && Object.keys(sales).length) setSalesCache(sales) }, [sales])
    useEffect(() => { if (data?.sales) setSalesCache(data.sales) }, [data?.sales])

    useEffect(() => {
        ++latestRequest.current
        setExtra([])
        setHasMore((data?.products?.length || 0) === LIMIT)
        setLoadingMore(false)
    }, [path])

    async function loadMore() {
        if (loadingMore || !hasMore) return
        const reqId = ++latestRequest.current
        setLoadingMore(true)
        try {
            const res = await apiReq('product/get', { path, skip: products.length, limit: LIMIT })
            if (reqId !== latestRequest.current) return
            setExtra(prev => [...prev, res])
            setHasMore(res.products.length === LIMIT)
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
    }, [hasMore, loadingMore, loading, path])

    if (pageData?.notFound) return <NotFound />

    return <Flex col className={styles.products} direction='column' gap={10}>
        <Breadcrumbs path={path} hideLast />
        <Text size='h1' bold>{data?.categoryName || pageData?.title}</Text>
        <div className={styles.list}>
            {loading ? <Loader />
                : products.map(p => <ProductCard
                    key={p.id}
                    product={p}
                    sales={p.saleIds.reduce((acc, sId) => sales[sId] ? { ...acc, [sId]: sales[sId] } : acc, {})}
                >{p.name}</ProductCard>)}
        </div>
        {!loading && hasMore && <div ref={sentinelRef} className={styles.sentinel} />}
        {loadingMore && <Loader />}
    </Flex>
}


Products.init = async function (path) {
    const res = await apiReq('product/get', { path, limit: LIMIT })
    // a category path that doesn't resolve to a category -> 404 (server falls
    // back to all products when the category filter doesn't match)
    const categoryRequested = path.replace(/^\/?products\/?/, '').length > 0
    if (categoryRequested && !res.categoryName) {
        return { notFound: true, title: '404' }
    }
    const title = decodeURIComponent(path).split('/').pop()
    if (res.products[0]) {
        const product = res.products[0]
        return {
            title: title || product.name,
            description: product.description,
            data: res
        }
    }
    return {
        title: decodeURI(title),
        description: title,
        data: res
    }
}
