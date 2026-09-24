import { useEffect, useRef, useState } from 'react'
import { useUser } from 'features/User'
import { useLists } from 'common/features/Lists'
import { useText } from 'common/texts/TextProvider'
import apiReq from 'common/functions/apiReq'
import { opsStoreAutoSelectM } from 'common/functions/opsConfig'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Button from 'common/components/Button'
import Select from 'common/components/Select'
import Loader from 'common/components/Loader'

// Max distance (m) from a store for auto-selecting it as the admin's current store
// → opsStoreAutoSelectM() (env OPS_STORE_AUTO_SELECT_M, default 100).
// Beyond this the existing currentStoreId is kept (or manual pick if none set).

function getPosition(timeoutMs = 8000) {
    return new Promise(resolve => {
        if (!navigator.geolocation) return resolve(null)
        let done = false
        const timer = setTimeout(() => { if (!done) { done = true; resolve(null) } }, timeoutMs)
        navigator.geolocation.getCurrentPosition(
            pos => { if (!done) { done = true; clearTimeout(timer); resolve([pos.coords.longitude, pos.coords.latitude]) } },
            () => { if (!done) { done = true; clearTimeout(timer); resolve(null) } },
            { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
        )
    })
}

// Blocking gate: the ops queue only loads once the admin has a currentStoreId.
// A single allowed store is auto-set (no GPS, no UI). Otherwise on every entry
// the admin is geolocated: within AUTO_SET_RADIUS_M of an allowed store it
// becomes the current store; if not, the existing currentStoreId is kept
// (wrong one can be switched via the store action). With no current store at
// all, the admin must pick from their allowed stores (no dismiss).
export default function StoreGate({ children }) {
    const { currentStoreId, setCurrentStore } = useUser()
    const lists = useLists()
    const { TR } = useText?.() || {}
    const [phase, setPhase] = useState('locating')
    const [chosen, setChosen] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const started = useRef(false)

    const stores = lists?.stores || []

    useEffect(() => {
        if (started.current) return
        started.current = true
        const existing = currentStoreId
        ;(async () => {
            // Single allowed store → it is the current store, no GPS, no UI.
            if (stores.length === 1 && stores[0].value) {
                try {
                    if (String(stores[0].value) !== existing) await setCurrentStore(stores[0].value)
                    setPhase('ready')
                    return
                } catch {
                    // fall through to existing store or manual select below
                }
            }
            try {
                const coords = await getPosition()
                if (coords) {
                    const nearby = await apiReq('store/nearby', { coordinates: coords })
                    if (nearby?.[0]?.id && nearby[0].distanceM <= opsStoreAutoSelectM()) {
                        if (nearby[0].id !== existing) await setCurrentStore(nearby[0].id)
                        setPhase('ready')
                        return
                    }
                }
            } catch {
                // fall through to existing store or manual select below
            }
            if (existing) {
                setPhase('ready')
                return
            }
            setPhase(stores.length ? 'select' : 'noStores')
        })()
    }, [])

    async function confirm() {
        if (!chosen || saving) return
        setSaving(true)
        setError('')
        try {
            await setCurrentStore(chosen)
            setPhase('ready')
        } catch (e) {
            setError(e?.message || 'ops_store_set_failed')
        } finally {
            setSaving(false)
        }
    }

    if (phase === 'ready' || currentStoreId) return children

    return <Flex grow center col gap={16} style={{ padding: 24 }}>
        {phase === 'locating' && <>
            <Loader />
            <Text>{TR?.('ops_locating_store') ?? 'ops_locating_store'}</Text>
        </>}
        {phase === 'select' && <>
            <Text size="l" bold center>{TR?.('ops_select_store') ?? 'ops_select_store'}</Text>
            <Select
                value={chosen}
                onChange={e => setChosen(e.target.value)}
                options={stores}
                placeholder={TR?.('select_store') ?? 'select store'}
                style={{ minWidth: 220 }}
            />
            {error && <Text size="s" mode="error" center>{error}</Text>}
            <Button loading={saving} disabled={!chosen} onClick={confirm}>
                {TR?.('ops_confirm_store') ?? 'ops_confirm_store'}
            </Button>
        </>}
        {phase === 'noStores' && (
            <Text center mode="error">{TR?.('ops_no_stores') ?? 'ops_no_stores'}</Text>
        )}
    </Flex>
}
