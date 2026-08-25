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
        [sort, setSort] = useState(defaultSort),
        [search, setSearch] = useState(''),
        { data, loading, error, callReq } = useApi(`${apiRoute}/read`, { limit, search, sort }, { hold: true }),
        { openModal, closeModal } = useModal()

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
        callReq({ sort, search, limit })
        const to = setTimeout(fetchCount, 300)
        return () => clearTimeout(to)
    }, [sort, search])

    function createUpdate(defaults) {
        openModal(<DataForm
            apiRoute={apiRoute}
            form={form}
            defaults={defaults}
            onDone={() => {
                callReq()
                fetchCount()
                closeModal()
            }}
        />, { title: `${defaults ? 'edit' : 'add'} ${apiRoute}` })
    }

    async function updateData(values) {
        return apiReq(`${apiRoute}/update`, values)
            .then(() => {
                callReq()
                fetchCount()
            })
    }

    return <DataContext value={{
        apiRoute,
        data, loading, error,
        count, callReq,
        sort, setSort,
        search, setSearch,
        createUpdate, form, updateData
    }}>
        {children}
    </DataContext>
}
