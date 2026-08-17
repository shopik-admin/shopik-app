import { createContext, useContext, useEffect, useState } from 'react'
import DataForm from 'Features/DataManager/DataForm'
import useApi from 'common/functions/useApi'
import { useModal } from 'Layout/Modal'
import apiReq from 'common/functions/apiReq.js'

const DataContext = createContext()
export const useData = () => useContext(DataContext)

export default function DataProvider({ children, apiRoute = '', form, limit = 30, defaultSort }) {
    const
        //{ data: count } = useApi(`${apiRoute}/count`),
        [sort, setSort] = useState(defaultSort),
        [search, setSearch] = useState(''),
        { data, loading, error, callReq } = useApi(`${apiRoute}/read`, { limit, search, sort }, { hold: true }),
        { openModal, closeModal } = useModal()

    useEffect(() => {
        callReq({ sort, search, limit })
    }, [sort, search])

    function createUpdate(defaults) {
        openModal(<DataForm
            apiRoute={apiRoute}
            form={form}
            defaults={defaults}
            onDone={() => {
                callReq()
                closeModal()
            }}
        />, { title: `${defaults ? 'edit' : 'add'} ${apiRoute}` })
    }

    async function updateData(values) {
        return apiReq(`${apiRoute}/update`, values)
            .then(() => callReq())
    }

    return <DataContext value={{
        apiRoute,
        data, loading, error,
        /* count, */ callReq,
        sort, setSort,
        search, setSearch,
        createUpdate, form, updateData
    }}>
        {children}
    </DataContext>
}
