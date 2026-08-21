import Breadcrumbs from 'components/Breadcrumbs'
import Loader from '#common/components/Loader'
import apiReq from '#common/functions/apiReq'
import styles from './products.module.css'
import Flex from '#common/components/Flex'
import Text from '#common/components/Text'
import ProductCard from './ProductCard'
import { usePage } from 'layout/Page'

export default function Products() {
    const { loading, pageData, path } = usePage()

    return <Flex col className={styles.products} direction='column' gap={10}>
        <Breadcrumbs path={path} />
        <Text size='h1' bold>{pageData?.data?.categoryName || pageData.title}</Text>
        <div className={styles.list}>
            {loading ? <Loader />
                : pageData?.data?.products?.map(p => <ProductCard
                    key={p.id}
                    product={p}
                    sales={pageData?.data?.sales}
                >{p.name}</ProductCard>)}
        </div>
    </Flex>
}


Products.init = async function (path) {
    const res = await apiReq('product/get', { path })
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