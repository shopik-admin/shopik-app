import { createContext, useContext, useEffect, useRef, useState } from 'react'
import DataForm from 'features/DataManager/DataForm'
import { useModal } from 'common/components/Modal'
import useApi from 'common/functions/useApi'
import apiReq from 'common/functions/apiReq'

const DataContext = createContext()
export const useData = () => useContext(DataContext)

function parseInitialFilter() {
    if (typeof window === 'undefined') return {}
    try {
        const sp = new URLSearchParams(window.location.search)
        const raw = sp.get('f')
        if (raw) return JSON.parse(decodeURIComponent(raw))
    } catch { }
    return {}
}

function parseInitialSearch() {
    if (typeof window === 'undefined') return ''
    try {
        const sp = new URLSearchParams(window.location.search)
        return sp.get('search') || ''
    } catch { return '' }
}

export default function DataProvider({ children, apiRoute = '', form, limit = 30, defaultSort }) {
    const
        [count, setCount] = useState(),
        countReqId = useRef(0),
        moreReqId = useRef(0),
        [sort, setSort] = useState(defaultSort),
        [search, setSearch] = useState(parseInitialSearch),
        [filter, setFilter] = useState(parseInitialFilter),
        { data: page, loading, error, callReq } = useApi(`${apiRoute}/read`, { limit, search, sort, filter }, { hold: true }),
        [extraRows, setExtraRows] = useState([]),
        [loadingMore, setLoadingMore] = useState(false),
        { openModal, closeModal } = useModal()

    const data = page ? [...page, ...extraRows] : undefined
    const hasMore = count != null
        ? (data?.length ?? 0) < count
        : (page?.length ?? 0) >= limit

    // URL persistence for filter + search (no sensitive info)
    useEffect(() => {
        if (typeof window === 'undefined') return
        const sp = new URLSearchParams(window.location.search)
        if (Object.keys(filter).length) sp.set('f', encodeURIComponent(JSON.stringify(filter)))
        else sp.delete('f')
        if (search) sp.set('search', search)
        else sp.delete('search')
        const qs = sp.toString()
        const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
        window.history.replaceState(null, '', url)
    }, [filter, search])

    function fetchCount() {
        const reqId = ++countReqId.current
        apiReq(`${apiRoute}/count`, { search, filter })
            .then(c => {
                if (reqId === countReqId.current)
                    setCount(c)
            })
            .catch(() => { })
    }

    useEffect(() => {
        ++moreReqId.current
        callReq({ sort, search, limit, filter })
        setExtraRows([])
        const to = setTimeout(fetchCount, 300)
        return () => clearTimeout(to)
    }, [sort, search, filter])

    async function loadMore() {
        if (loadingMore || !hasMore) return
        const reqId = ++moreReqId.current
        setLoadingMore(true)
        try {
            const rows = await apiReq(`${apiRoute}/read`, { limit, search, sort, filter, skip: (page?.length || 0) + extraRows.length })
            if (reqId === moreReqId.current)
                setExtraRows(prev => [...prev, ...rows])
        } finally {
            if (reqId === moreReqId.current)
                setLoadingMore(false)
        }
    }

    function refresh() {
        ++moreReqId.current
        setExtraRows([])
        callReq({ sort, search, limit, filter })
        fetchCount()
    }

    function createUpdate(defaults) {
        openModal(<DataForm
            apiRoute={apiRoute}
            form={form}
            defaults={defaults}
            onDone={() => {
                refresh()
                closeModal()
            }}
        />, { title: `${defaults ? 'edit' : 'add'} ${apiRoute}` })
    }

    async function updateData(values) {
        return apiReq(`${apiRoute}/update`, values)
            .then(refresh)
    }

    return <DataContext value={{
        apiRoute,
        data, loading, error,
        count, callReq,
        sort, setSort,
        search, setSearch,
        filter, setFilter,
        createUpdate, form, updateData, loadMore, loadingMore, hasMore
    }}>
        {children}
    </DataContext>
}
