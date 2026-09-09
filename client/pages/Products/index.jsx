import apiReq from '#common/functions/apiReq'
import { usePage } from 'layout/Page'
import ProductList, { PRODUCT_LIST_LIMIT } from './ProductList'
import DisplayBlocks from 'features/Display/DisplayBlocks'

export default function Products() {
    const { loading, pageData, path } = usePage()
    const data = pageData?.data

    return <>
        <DisplayBlocks blocks={data?.blocks} />
        <ProductList
            data={data}
            loading={loading}
            notFound={pageData?.notFound}
            title={data?.categoryName || pageData?.title}
            breadcrumbPath={path}
            resetKey={path}
            fetchPage={({ skip, limit }) => apiReq('product/get', { path, skip, limit })}
        />
    </>
}


Products.init = async function (path) {
    const pagePath = `/${String(path).replace(/^\//, '')}`
    const [res, display] = await Promise.all([
        apiReq('product/get', { path, limit: PRODUCT_LIST_LIMIT }),
        apiReq('display_block/get', { path: pagePath }).catch(() => ({ blocks: [] }))
    ])
    const blocks = display.blocks || []
    // a category path that doesn't resolve to a category -> 404 (server falls
    // back to all products when the category filter doesn't match)
    const categoryRequested = path.replace(/^\/?products\/?/, '').length > 0
    if (categoryRequested && !res.categoryName) {
        return { notFound: true, title: '404' }
    }
    const title = decodeURIComponent(path).split('/').filter(Boolean).pop() || ''
    if (res.products[0]) {
        const product = res.products[0]
        return {
            title: title || product.name,
            description: product.description,
            data: { ...res, blocks }
        }
    }
    return {
        title,
        description: title,
        data: { ...res, blocks }
    }
}
