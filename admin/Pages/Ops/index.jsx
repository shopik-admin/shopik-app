import { useEffect, useMemo, useRef, useState } from 'react'
import DataManager from 'features/DataManager'
import { useData } from 'features/DataManager/DataProvider'
import useApi from 'common/functions/useApi'
import { useUser } from 'features/User'
import Tabs from 'common/components/Tabs'
import Button from 'common/components/Button'
import Flex from 'common/components/Flex'
import Popover from 'common/components/Popover'
import styles from './ops.module.css'
import OrderCard from './OrderCard'
import StoreGate from './StoreGate'
import StorePill from './StorePill'
import { todayStr } from '../Windows/dates.js'
import { shortNumber } from './orderUtils'
import { opsScope, viewScope, opsStatusWindow, ROLE_SCOPES } from 'common/functions/opsView.js'

const opsCols = [
    { key: 'number', render: row => shortNumber(row.number) },
    { key: 'status', type: 'tr' },
    { key: 'storeId' },
    { key: 'deliveryMethod', type: 'tr' },
    { key: 'window.date', type: 'tr' },
]

// One tab per role, plus the shipper's own queue. What a tab asks the queue for is
// the role's shape narrowed by the tab: the own-or-unclaimed rule is applied
// server-side (opsFilter), so a tab can never request more than its permission allows.
const TABS = {
    picker: [{ key: 'picking', text: 'ops_tab_picking' }],
    shipper: [
        { key: 'waiting', text: 'ops_tab_waiting' },
        { key: 'mine', text: 'ops_tab_mine' },
    ],
    manager: [{ key: 'queue', text: 'ops_tab_queue' }],
    contractor: [{ key: 'queue', text: 'ops_tab_queue' }],
}

// The window is per status — a closed order is bounded backwards, an order still in
// process is not — so a tab sends the whole clause opsStatusWindow builds rather than
// a status plus one date range, which would drop the late orders.
function tabFilter(tab, permission, today, me) {
    const scope = viewScope(permission)
    if (tab == 'waiting') return opsStatusWindow({ scope, status: 'packed', today })

    const base = opsStatusWindow({ scope, today })
    if (tab == 'mine') return { ...base, 'shipper.adminId': me }
    return base
}

const VIEWS = {
    'order:read': { text: 'ops_view_as_manager', icon: 'orders' },
    'order:pick:manage': { text: 'ops_view_as_manager', icon: 'orders' },
    'order:ship:manage': { text: 'ops_view_as_contractor', icon: 'truck' },
    'order:ship': { text: 'ops_view_as_shipper', icon: 'truck' },
    'order:pick': { text: 'ops_view_as_picker', icon: 'bag' },
}

function readView() {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('v') || ''
}

// Switching view clears the filter: the new role's shape replaces it, and a filter
// left from the previous role could ask for more than this one can see.
function writeView(permission) {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    sp.delete('f')
    if (permission) sp.set('v', permission)
    else sp.delete('v')
    const qs = sp.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`)
}

export default function Ops({ }) {
    const user = useUser()
    const scope = opsScope({
        hasPermission: permission => user?.role?.permissions?.includes(permission),
        isSuperAdmin: user?.isSuperAdmin
    })
    const [view, setView] = useState(readView)
    // A view in the URL has to be one of the permissions actually held — otherwise
    // the page falls back to the role, and a link cannot ask for a view it has no
    // permission for.
    const current = view && scope.held.includes(view) ? view : scope.held[0]
    const tabs = TABS[ROLE_SCOPES[current].role]

    // Only a read-level view has filter controls. A queue role is fixed by its tabs:
    // its statuses and its window are the permission, so a filter he can set would be
    // one he cannot use — and there would be nothing to remove.
    const canFilter = ROLE_SCOPES[current].statuses === null

    // The first load has to carry the active tab's filter, not an empty one.
    const today = todayStr()
    const initialFilter = tabFilter(tabs[0].key, current, today, user?.id)

    return <StoreGate multiStore={scope.stores == 'scope'}>
        <Flex col>
            <DataManager
                apiRoute='order/ops'
                actions={['refresh']}
                defaultSort={{ 'window.endTimestamp': 1 }}
                initialFilter={initialFilter}
                filters={canFilter}
                cols={opsCols}
            >
                <OpsQueue scope={scope} current={current} tabs={tabs} onChangeView={setView} />
            </DataManager>
        </Flex>
    </StoreGate>
}

function OpsQueue({ scope, current, tabs, onChangeView }) {
    const { data: orders = [], setFilter, setData } = useData()
    const { id } = useUser()
    const today = todayStr()
    const [tab, setTab] = useState(tabs[0].key)

    const filters = useMemo(
        () => Object.fromEntries(tabs.map(t => [t.key, tabFilter(t.key, current, today, id)])),
        [tabs, current, today, id]
    )

    const firstRun = useRef(true)
    useEffect(() => {
        if (firstRun.current) { firstRun.current = false; return }
        setData(undefined)
        if (filters[tab]) setFilter(filters[tab])
    }, [tab, filters, setData, setFilter])

    // One entry per view — order:read and order:pick:manage are the same view, so an
    // admin holding both would otherwise list it twice.
    const views = scope.held.filter((p, i) =>
        scope.held.findIndex(q => ROLE_SCOPES[q].role == ROLE_SCOPES[p].role) == i
    )

    function switchView(permission) {
        writeView(permission)
        onChangeView(permission)
        setTab(TABS[ROLE_SCOPES[permission].role][0].key)
    }

    return <Flex col gap={10} className={styles.ops}>
        <Flex className={styles.viewToggleFloat} gap={8}>
            <ViewPicker
                views={views}
                current={current}
                onPick={switchView}
            />
            <StorePill multiStore={scope.stores == 'scope'} />
        </Flex>
        {/* A single tab is not a choice — it is the whole view — so nothing is rendered
            for it, not even its title or its count. */}
        {tabs.length > 1 && <Flex col className={styles.tabsBar}>
            <Tabs
                mode='line'
                active={tab}
                onChange={setTab}
                options={tabs.map(t => ({ value: t.key, text: t.text, badge: <TabCount filter={filters[t.key]} /> }))}
            />
        </Flex>}
        {orders.map(order => <OrderCard key={order.number} order={order} />)}
    </Flex>
}

// A hook per tab is not possible in a loop, so the count is its own component and
// the badge is what it returns. Same route and filter as the tab's own list, so a
// badge can never count rows the tab would not show.
function TabCount({ filter }) {
    const { data, callReq } = useApi('order/ops/count', { filter }, { hold: true })
    useEffect(() => { callReq({ filter }) }, [filter])
    return data
}

// One pill for the view: it names the view you are in and opens the list of the
// views your permission allows. One button per view duplicated the same control.
// With a single view there is nothing to select, so the pill is not shown at all.
function ViewPicker({ views, current, onPick }) {
    if (views.length < 2) return null

    return <Popover
        button={<Button mode='outline' icon={VIEWS[current].icon}>{VIEWS[current].text}</Button>}
    >
        {({ close }) => <Flex col gap={8} style={{ minWidth: 190 }}>
            {views.map(p => <Button
                key={p}
                mode='outline'
                icon={p == current ? 'check' : VIEWS[p].icon}
                onClick={() => { onPick(p); close() }}
            >{VIEWS[p].text}</Button>)}
        </Flex>}
    </Popover>
}
