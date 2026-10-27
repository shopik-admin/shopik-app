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

export default function DataProvider({ children, apiRoute = '', form, limit = 30, defaultSort, initialFilter }) {
    const
        [count, setCount] = useState(),
        countReqId = useRef(0),
        // Dataset version: bumped whenever the query changes (sort/search/filter)
        // or refresh() runs. A load-more response from the old query is dropped.
        dataVersion = useRef(0),
        inFlight = useRef(false),
        dataLenRef = useRef(0),
        [sort, setSort] = useState(defaultSort),
        [search, setSearch] = useState(parseInitialSearch),
        [filter, setFilter] = useState(() => initialFilter ?? parseInitialFilter()),
        { data: page, loading, error, callReq, setData: setPage } = useApi(`${apiRoute}/read`, { limit, search, sort, filter }, { hold: true }),
        [extraRows, setExtraRows] = useState([]),
        [loadingMore, setLoadingMore] = useState(false),
        { openModal, closeModal } = useModal()

    const data = page ? [...page, ...extraRows] : undefined
    // Latest committed row count — read by loadMore at call time so concurrent
    // scroll events can't reuse a stale `skip`.
    dataLenRef.current = data?.length || 0
    // `page == null` guard: count can resolve before the first page, which used
    // to make hasMore true while skip was 0 (page 1 appended on top of page 1).
    const hasMore = page == null ? false
        : count != null
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

    function resetPaging() {
        ++dataVersion.current
        inFlight.current = false
        setExtraRows([])
        setLoadingMore(false)
    }

    useEffect(() => {
        resetPaging()
        callReq({ sort, search, limit, filter })
        const to = setTimeout(fetchCount, 300)
        return () => clearTimeout(to)
    }, [sort, search, filter])

    async function loadMore() {
        // `loading` covers the window between a query change and the new first
        // page arriving, where `data` still holds the previous query's rows.
        if (inFlight.current || loading || !hasMore) return
        const version = dataVersion.current
        const skip = dataLenRef.current
        inFlight.current = true
        setLoadingMore(true)
        try {
            const rows = await apiReq(`${apiRoute}/read`, { limit, search, sort, filter, skip })
            // Query changed / refreshed mid-flight — extraRows was cleared and
            // these rows belong to the previous dataset.
            if (version === dataVersion.current)
                setExtraRows(prev => [...prev, ...(rows || [])])
        } catch { }
        finally {
            if (version === dataVersion.current) {
                inFlight.current = false
                setLoadingMore(false)
            }
        }
    }

    function refresh() {
        resetPaging()
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
        count, callReq, setData: setPage,
        sort, setSort,
        search, setSearch,
        filter, setFilter,
        createUpdate, form, updateData, loadMore, loadingMore, hasMore, refresh
    }}>
        {children}
    </DataContext>
}
