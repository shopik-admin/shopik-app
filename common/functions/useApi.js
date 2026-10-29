import { useEffect, useRef, useState } from 'react'
import apiReq from '../functions/apiReq'

export default function useApi(path, req, options = {}) {
    const
        { hold, fields } = options,
        [data, setData] = useState(),
        [error, setError] = useState(),
        [loading, setLoading] = useState(!hold),
        reqId = useRef(0)

    useEffect(() => { if (!hold) callReq() }, [])

    async function callReq(callData = req) {
        const id = ++reqId.current
        setLoading(true)
        setError()
        // Responses can resolve out of order (fast typing/sorting); only the
        // latest request may touch state or an old page overwrites the new one.
        return apiReq(path, callData, fields)
            .then(res => { if (id === reqId.current) setData(res) })
            .catch(err => { if (id === reqId.current) setError(err) })
            .finally(() => { if (id === reqId.current) setLoading(false) })
    }

    return { data, loading, error, callReq, setData, setLoading }
}