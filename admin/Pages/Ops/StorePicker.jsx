import { useEffect, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import useGeolocation from 'common/functions/useGeolocation'
import distanceMeters from 'common/functions/distance'
import { OPS_STORE_AUTO_SELECT_M } from 'common/constants'

export default function StorePicker({ onSelected }) {
    const { coords, error, loading } = useGeolocation()
    const [stores, setStores] = useState([])
    const [err, setErr] = useState(null)

    useEffect(() => {
        if (!coords) return
        apiReq('store/nearby', { coordinates: coords })
            .then(list => {
                setStores(list)
                const closest = list[0]
                if (closest && typeof closest.distanceM === 'number' && closest.distanceM < OPS_STORE_AUTO_SELECT_M) {
                    apiReq('admin/current_store', { storeId: closest.id }).then(() => onSelected?.(closest.id)).catch(() => {})
                } else if (list.length) {
                    // annotate distances if not provided
                    const withDist = list.map(s => ({ ...s, distanceM: s.distanceM ?? (s.address?.location?.coordinates ? distanceMeters(coords, s.address.location.coordinates) : Infinity) }))
                    withDist.sort((a,b)=>a.distanceM-b.distanceM)
                    setStores(withDist)
                }
            })
            .catch(e => setErr(String(e)))
    }, [coords])

    if (loading) return <div>Locating…</div>
    if (error) return <div>No location permission — Ops is blocked. Please enable GPS: {error}</div>
    if (err) return <div>Error: {err}</div>

    async function pick(id) {
        await apiReq('admin/current_store', { storeId: id })
        onSelected?.(id)
    }

    return <div>
        <h3>Select store</h3>
        {stores.map(s => <button key={s.id} onClick={()=>pick(s.id)} style={{display:'block', width:'100%', padding:'12px', margin:'6px 0'}}>
            {s.name} — {Math.round(s.distanceM)}m
        </button>)}
        {!stores.length && <div>No stores nearby</div>}
    </div>
}
