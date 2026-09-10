import { useEffect, useMemo, useRef, useState } from 'react'
import DataManager from 'features/DataManager'
import DataProvider, { useData } from 'features/DataManager/DataProvider'
import usePermission from 'common/permissions/usePermision'
import useApi from 'common/functions/useApi'
import { useUser } from 'features/User'
import Tabs from 'common/components/Tabs'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import styles from './ops.module.css'
import OrderCard from './OrderCard'
import { todayStr } from '../Windows/dates.js'

const TABS = {
    WAITING: 'waiting',
    MINE: 'mine',
    PICKING: 'picking'
}

const opsCols = [
    { key: 'number' },
    { key: 'status', type: 'tr' },
    { key: 'storeId' },
    { key: 'deliveryMethod', type: 'tr' },
    { key: 'window.date', type: 'tr' },
]

function readAsShipper() {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('asShipper') === '1'
}

function writeAsShipper(on) {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    sp.delete('f')
    if (on) sp.set('asShipper', '1')
    else sp.delete('asShipper')
    const qs = sp.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`)
}

export default function Ops({ }) {
    const canRead = usePermission('order:read')
    const canShip = usePermission('order:ship')
    const [asShipper, setAsShipper] = useState(readAsShipper)
    function enterShipperView() { writeAsShipper(true); setAsShipper(true) }
    function exitShipperView() { writeAsShipper(false); setAsShipper(false) }
    if (canRead && !asShipper) return <Flex col>
        <Flex className={styles.viewToggleFloat}>
            <Button mode='outline' icon='truck' onClick={enterShipperView}>ops_view_as_shipper</Button>
        </Flex>
        <DataManager
            apiRoute='order/ops'
            actions={['refresh']}
            defaultSort={{ 'window.endTimestamp': 1 }}
            cols={opsCols}
        >
            <OpsInner />
        </DataManager>
    </Flex>
    return <ShipperPickerData canShip={canShip} asShipper={asShipper} onExitShipperView={asShipper ? exitShipperView : null} />
}

function waitingFilter(canRead) {
    return canRead ? { status: 'packed' } : { status: 'packed', 'window.date': todayStr() }
}

function ShipperPickerData({ canShip, asShipper, onExitShipperView }) {
    const canRead = usePermission('order:read')
    const initialFilter = (canShip || asShipper)
        ? waitingFilter(canRead)
        : { status: { $in: ['paid', 'picking', 'picked'] } }
    return <DataProvider
        apiRoute='order/ops'
        defaultSort={{ 'window.endTimestamp': 1 }}
        initialFilter={initialFilter}
    >
        {canShip || asShipper
            ? <ShipperOps onExit={onExitShipperView} />
            : <PickerOps />}
    </DataProvider>
}

function OpsInner() {
    const { data: orders = [] } = useData()
    return <Flex col gap={10} className={styles.ops}>
        {orders.map(order => <OrderCard key={order.number} order={order} />)}
    </Flex>
}

function ShipperOps({ onExit }) {
    const [tab, setTab] = useState(TABS.WAITING)
    const { data: orders = [], setFilter, setData } = useData()
    const { id } = useUser()
    const canRead = usePermission('order:read')
    const filters = useMemo(() => ({
        [TABS.WAITING]: waitingFilter(canRead),
        [TABS.MINE]: { status: 'shipped', 'shipper.adminId': id },
    }), [id, canRead])

    const firstRun = useRef(true)
    useEffect(() => {
        if (firstRun.current) { firstRun.current = false; return }
        setData(undefined)
        setFilter(filters[tab])
    }, [tab, filters, setData, setFilter])

    const waitingCount = useApi('order/ops/count', { filter: filters[TABS.WAITING] })
    const mineCount = useApi('order/ops/count', { filter: filters[TABS.MINE] })

    return <Flex col gap={10} className={styles.ops}>
        {onExit && <Flex className={styles.viewToggleFloat}>
            <Button mode='outline' icon='orders' onClick={onExit}>ops_view_as_manager</Button>
        </Flex>}
        <Tabs
            mode='line'
            active={tab}
            onChange={setTab}
            className={styles.shipTabs}
            options={[
                { value: TABS.WAITING, text: 'ops_tab_waiting', badge: waitingCount.data },
                { value: TABS.MINE, text: 'ops_tab_mine', badge: mineCount.data },
            ]}
        />
        {orders.map(order => <OrderCard key={order.number} order={order} />)}
    </Flex>
}

function PickerOps() {
    const { data: orders = [] } = useData()
    const pickingFilter = { status: { $in: ['paid', 'picking', 'picked'] } }
    const pickingCount = useApi('order/ops/count', { filter: pickingFilter })

    return <Flex col gap={10} className={styles.ops}>
        <Tabs
            mode='line'
            active={TABS.PICKING}
            className={styles.shipTabs}
            options={[
                { value: TABS.PICKING, text: 'ops_tab_picking', badge: pickingCount.data },
            ]}
        />
        {orders.map(order => <OrderCard key={order.number} order={order} />)}
    </Flex>
}
