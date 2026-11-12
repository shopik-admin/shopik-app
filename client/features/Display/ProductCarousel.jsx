import { useEffect } from 'react'
import { setSalesCache } from '#common/functions/salesCache.js'
import { useText } from '#common/texts/TextProvider'
import ProductRail from './ProductRail'

export default function ProductCarousel({ block }) {
    const { TR } = useText()
    const { title } = block
    const { showAll, showAllText, autoplaySec } = block.carousel || {}
    const products = block.products || []
    const sales = block.sales || {}
    useEffect(() => { if (Object.keys(sales).length) setSalesCache(sales) }, [sales])
    if (!products.length) return null

    return <ProductRail
        title={title || block.name}
        products={products}
        sales={sales}
        autoplaySec={autoplaySec}
        showAllTo={showAll !== false ? `/carousel/${block.id}` : null}
        showAllText={showAllText || TR('display_show_all_default')}
    />
}
