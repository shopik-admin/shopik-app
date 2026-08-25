import { createContext, useContext, useEffect, useRef, useState } from 'react'
import DataForm from 'features/DataManager/DataForm'
import { useModal } from 'common/components/Modal'
import useApi from 'common/functions/useApi'
import apiReq from 'common/functions/apiReq'

const DataContext = createContext()
export const useData = () => useContext(DataContext)

export default function DataProvider({ children, apiRoute = '', form, limit = 30, defaultSort }) {
    const
        [count, setCount] = useState(),
        countReqId = useRef(0),
        moreReqId = useRef(0),
        [sort, setSort] = useState(defaultSort),
        [search, setSearch] = useState(''),
        { data: page, loading, error, callReq } = useApi(`${apiRoute}/read`, { limit, search, sort }, { hold: true }),
        [extraRows, setExtraRows] = useState([]),
        [loadingMore, setLoadingMore] = useState(false),
        { openModal, closeModal } = useModal()

    const data = page ? [...page, ...extraRows] : undefined
    const hasMore = count != null
        ? (data?.length ?? 0) < count
        : (page?.length ?? 0) >= limit

    function fetchCount() {
        const reqId = ++countReqId.current
        apiReq(`${apiRoute}/count`, { search })
            .then(c => {
                if (reqId === countReqId.current)
                    setCount(c)
            })
            .catch(() => { })
    }

    useEffect(() => {
        ++moreReqId.current
        callReq({ sort, search, limit })
        setExtraRows([])
        const to = setTimeout(fetchCount, 300)
        return () => clearTimeout(to)
    }, [sort, search])

    async function loadMore() {
        if (loadingMore || !hasMore) return
        const reqId = ++moreReqId.current
        setLoadingMore(true)
        try {
            const rows = await apiReq(`${apiRoute}/read`, { limit, search, sort, skip: (page?.length || 0) + extraRows.length })
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
        callReq()
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
        createUpdate, form, updateData, loadMore, loadingMore, hasMore
    }}>
        {children}
    </DataContext>
}
