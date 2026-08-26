import { useLocation, useParams, matchPath } from 'react-router'
import pages from 'pages'
import { useAppData } from 'App'
import { applyHeadToDocument } from 'layout/Head'
import { useEffect, useState } from 'react'

const BRAND = 'Shopik'

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
            page.element.init?.(decodeURI(pathname), { origin: window.location.origin })
                .then(pageData => {
                    pageData.prevPath = pathname
                    setData(pageData)
                    const seo = pageData.seo || {}
                    applyHeadToDocument({
                        title: `${BRAND} | ${pageData.title || page.title}`,
                        description: pageData.description || page.description,
                        noindex: seo.noindex,
                        canonical: seo.canonical || `${window.location.origin}${pathname === '/' ? '' : pathname}`,
                        og: {
                            title: pageData.title && `${BRAND} | ${pageData.title}`,
                            description: pageData.description,
                            url: seo.canonical,
                            type: seo.ogType,
                            image: seo.image
                        }
                    })
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
