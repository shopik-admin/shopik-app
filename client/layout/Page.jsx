import { useLocation, useParams, matchPath } from 'react-router'
import pages from 'pages'
import { useAppData } from 'App'
import { useEffect, useState } from 'react'

export function usePage(initialData) {
    const { pathname } = useLocation()
    const params = useParams()
    const appData = useAppData()
    const page = pages.find(p =>
        matchPath({ path: p.path, end: true }, pathname)
    )
    const [data, setData] = useState(initialData || appData.initData || {})
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (initialData) {
            if (data.prevPath !== pathname) {
                setData({ ...initialData, prevPath: pathname })
            }
            return
        }
        if ((data.prevPath || appData.url) !== pathname) {
            setLoading(true)
            page.element.init?.(decodeURI(pathname))
                .then(pageData => {
                    pageData.prevPath = pathname
                    setData(pageData)
                    document.title = `Shopik | ${pageData.title}`
                    document.description = pageData.description
                })
                .finally(() => setLoading(false))
        }
    }, [page.path, params, pathname, initialData])

    return {
        page,
        params,
        pageData: data,
        loading,
        path: decodeURIComponent(pathname)
    }
}   
