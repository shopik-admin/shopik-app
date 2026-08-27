import { useEffect, useState } from 'react'

export default function useGeolocation(options = {}) {
    const [coords, setCoords] = useState(null)
    const [error, setError] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!navigator.geolocation) {
            setError('geolocation not supported')
            setLoading(false)
            return
        }
        const id = navigator.geolocation.watchPosition(
            pos => {
                setCoords([pos.coords.longitude, pos.coords.latitude])
                setError(null)
                setLoading(false)
            },
            err => {
                setError(err.message || 'location denied')
                setLoading(false)
            },
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000, ...options }
        )
        return () => navigator.geolocation.clearWatch(id)
    }, [])

    return { coords, error, loading }
}
