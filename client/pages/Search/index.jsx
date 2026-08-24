import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import apiReq from '#common/functions/apiReq'
import Loader from '#common/components/Loader'
import Flex from '#common/components/Flex'
import Text from '#common/components/Text'
import ProductCard from 'pages/Products/ProductCard'
import { usePage } from 'layout/Page'
import { useText } from '#common/texts/TextProvider'
import styles from 'pages/Products/products.module.css'

export default function Search() {
    const { TR } = useText()
    const [searchParams] = useSearchParams()
    const q = (searchParams.get('q') || '').trim()
    const { pageData } = usePage()
    const latestRequest = useRef(0)
    const seeded = useRef(pageData?.q === q && Array.isArray(pageData?.results))
    const [results, setResults] = useState(() => (seeded.current ? pageData.results : undefined))
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (seeded.current) {
            seeded.current = false
            return
        }
        if (q.length < 2) {
            setResults(undefined)
            return
        }

        const currentRequest = ++latestRequest.current
        setLoading(true)
        apiReq('product/search', { value: q, limit: 30 })
            .then(products => {
                if (currentRequest === latestRequest.current) setResults(products)
            })
            .catch(() => {
                if (currentRequest === latestRequest.current) setResults([])
            })
            .finally(() => {
                if (currentRequest === latestRequest.current) setLoading(false)
            })
    }, [q])

    useEffect(() => {
        document.title = `Shopik | ${q ? `${TR('search_results_title')}: ${q}` : TR('search')}`
    }, [q, loading])

    return <Flex col className={styles.products} direction='column' gap={10}>
        <Text size='h1' bold>{q ? `${TR('search_results_title')}: ${q}` : TR('search')}</Text>
        <div className={styles.list}>
            {loading ? <Loader /> : results?.length
                ? results.map(p => <ProductCard key={p.id} product={p} />)
                : (results ? <Text mode='sub'>{TR('no_search_results')}</Text> : null)}
        </div>
    </Flex>
}

Search.init = async function (url) {
    const q = new URL(url, 'http://localhost').searchParams.get('q')?.trim() || ''
    let results = []
    if (q.length >= 2) {
        results = await apiReq('product/search', { value: q, limit: 30 }).catch(() => [])
    }
    return {
        title: q,
        q,
        results
    }
}
