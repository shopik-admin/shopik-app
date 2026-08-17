import { useEffect, useState } from 'react'
import apiReq from '../functions/apiReq'

export default function useApi(path, req, options = {}) {
    const
        { hold, fields } = options,
        [data, setData] = useState(),
        [error, setError] = useState(),
        [loading, setLoading] = useState(!hold)

    useEffect(() => { if (!hold) callReq() }, [])

    async function callReq(callData = req) {
        setLoading(true)
        setError()
        return apiReq(path, callData, fields)
            .then(setData)
            .catch(setError)
            .finally(setLoading)
    }

    return { data, loading, error, callReq, setData, setLoading }
}