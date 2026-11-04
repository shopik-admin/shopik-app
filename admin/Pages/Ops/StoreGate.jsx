import { useEffect, useRef, useState } from 'react'
import { useUser } from 'features/User'
import { useLists } from 'common/features/Lists'
import apiReq from 'common/functions/apiReq'
import getPosition from 'common/functions/getPosition'
import { opsStoreAutoSelectM } from 'common/functions/opsConfig'
import Flex from 'common/components/Flex'
import Text from 'common/components/Text'
import Loader from 'common/components/Loader'
import StorePicker from './StorePicker'

// Blocking gate: the ops queue only loads once the admin has a currentStoreId.
// A single allowed store is auto-set (no GPS, no UI). Otherwise on every entry
// the admin is geolocated: within opsStoreAutoSelectM() (env
// OPS_STORE_AUTO_SELECT_M, default 100) of an allowed store it becomes the
// current store; if not, the existing currentStoreId is kept (a wrong one can
// be switched via the store pill). With no current store at all, the admin must
// pick from their allowed stores (no dismiss).
// The contractor queue is not a single store — it covers every store he owns at
// once — so the gate does not apply to him, only the check that he owns any.
export default function StoreGate({ children, multiStore }) {
    const { currentStoreId, setCurrentStore } = useUser()
    const [phase, setPhase] = useState('locating')
    const started = useRef(false)
    const stores = useLists()?.stores || []

    useEffect(() => {
        if (started.current || multiStore) return
        started.current = true
        const existing = currentStoreId
        ;(async () => {
            const pick = async id => {
                if (String(id) !== String(existing)) await setCurrentStore(id)
                setPhase('ready')
            }
            if (stores.length === 1 && stores[0].value) {
                try { return await pick(stores[0].value) } catch { }
            }
            try {
                const coordinates = await getPosition()
                const nearby = coordinates && await apiReq('store/nearby', { coordinates })
                if (nearby?.[0]?.distanceM <= opsStoreAutoSelectM())
                    return await pick(nearby[0].id)
            } catch { }
            if (existing) return setPhase('ready')
            setPhase(stores.length ? 'select' : 'noStores')
        })()
    }, [])

    if (multiStore) return stores.length ? children : <NoStores />
    if (phase === 'ready' || currentStoreId) return children

    return <Flex grow center col gap={16} style={{ padding: 24 }}>
        {phase === 'locating' && <>
            <Loader />
            <Text>ops_locating_store</Text>
        </>}
        {phase === 'select' && <>
            <Text size="l" bold center>ops_select_store</Text>
            <StorePicker />
        </>}
        {phase === 'noStores' && <NoStores />}
    </Flex>
}

function NoStores() {
    return <Flex grow center col gap={16} style={{ padding: 24 }}>
        <Text center mode="error">ops_no_stores</Text>
    </Flex>
}
