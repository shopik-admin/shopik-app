import apiReq from '#common/functions/apiReq'
import { usePage } from 'layout/Page'
import ProductList, { PRODUCT_LIST_LIMIT } from 'pages/Products/ProductList'

export default function Sales() {
    const { loading, pageData } = usePage()
    const data = pageData?.data

    return <>
        <ProductList
            data={data}
            loading={loading}
            notFound={pageData?.notFound}
            title={data?.categoryName || pageData?.title || 'מבצעים'}
            breadcrumbPath='/sales'
            resetKey='sales'
            emptyText='אין מבצעים כרגע'
            blocks={data?.blocks}
            fetchPage={({ skip, limit }) => apiReq('product/get', { onSale: true, skip, limit })}
        />
    </>
}

Sales.init = async function () {
    const [res, display] = await Promise.all([
        apiReq('product/get', { onSale: true, limit: PRODUCT_LIST_LIMIT }),
        apiReq('display_block/get', { path: '/sales' }).catch(() => ({ blocks: [] }))
    ])
    return {
        title: 'מבצעים',
        description: 'מוצרים במבצע',
        data: { ...res, blocks: display.blocks || [] }
    }
}
