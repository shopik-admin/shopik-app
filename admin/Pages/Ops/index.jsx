import { useEffect, useMemo, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import useGeolocation from 'common/functions/useGeolocation'
import distanceMeters from 'common/functions/distance'
import StorePicker from './StorePicker'
import { OPS_PROXIMITY_RADIUS_M } from 'common/constants'
import { useUser } from 'features/User'
import Icon from 'common/components/Icon'
import DataProvider, { useData } from 'features/DataManager/DataProvider'
import FilterBar from 'features/DataManager/FilterBar'
import styles from './ops.module.css'

// --- hebrew status labels (match design) ---
const STATUS_LABEL = {
    paid: 'ממתין לליקוט',
    picking: 'בליקוט',
    picked: 'ממתין לאריזה',
    packed: 'ממתין לשילוח',
    shipped: 'בשילוח',
    done: 'סופק',
    canceled: 'בוטל',
    failed: 'נכשל',
}

function progressOf(order) {
    const total = order?.cart?.length || 0
    if (!total) return { done: 0, total: 0, pct: 0 }
    const done = order.cart.filter(c => c.finalAmount != null || c.missing).length
    const pct = total ? Math.round((done / total) * 100) : 0
    return { done, total, pct }
}

function variantOf(order) {
    const s = order?.status
    if (s === 'picking') return 'picking'
    if (s === 'picked') return 'picking'
    if (s === 'packed') return 'packed'
    if (s === 'shipped') return 'shipped'
    if (s === 'done') return 'done'
    if (s === 'paid') {
        const end = order?.window?.endTimestamp ? new Date(order.window.endTimestamp).getTime() : 0
        if (end && end - Date.now() < 60 * 60 * 1000 && end > Date.now()) return 'urgent'
        return 'waiting'
    }
    return 'idle'
}

function formatDayWindow(w) {
    if (!w) return ''
    if (w.date && w.start != null && w.end != null) {
        const d = new Date(w.date)
        const day = d.toLocaleDateString('he-IL', { weekday: 'short' })
        return `${day} ${w.start}-${w.end}`
    }
    if (w.start != null && w.end != null) return `${w.start}-${w.end}`
    if (w.date) return w.date
    return ''
}

function formatTimeHM(w) {
    if (!w?.endTimestamp) return '--:--'
    const d = new Date(w.endTimestamp)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function ProgressRing({ pct, color = '#eab308' }) {
    const r = 22, c = 2 * Math.PI * r, off = c - (pct / 100) * c
    return <div className={styles.progressRing}>
        <svg width="56" height="56" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r={r} stroke="#f3f4f6" strokeWidth="5" fill="none" />
            <circle cx="28" cy="28" r={r} stroke={color} strokeWidth="5" fill="none" strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={off} />
        </svg>
        <span className={styles.progressLabel}>{pct}%</span>
    </div>
}

function OrderCard({ o, onAction, coords }) {
    const { done, total, pct } = progressOf(o)
    const variant = variantOf(o)
    const foot = variant
    const colorMap = { picking: '#22c55e', packed: '#06b6d4', shipped: '#8b5cf6', waiting: '#f59e0b', urgent: '#ef4444', done: '#16a34a', idle: '#d1d5db' }
    const ringColor = colorMap[variant] || '#e5e7eb'
    const addr = o.storeName || o.address?.city || ''
    const street = o.address ? `${o.address.street || ''} ${o.address.building || ''}`.trim() : ''
    const dist = coords && o.address?.location?.coordinates ? Math.round(distanceMeters(coords, o.address.location.coordinates)) : null
    const canDeliver = o.status === 'shipped' && (dist != null ? dist <= OPS_PROXIMITY_RADIUS_M : false)
    const boxes = o.boxes || {}

    return <div className={styles.orderCard} data-variant={variant}>
        <div className={styles.cardTop}>
            <span className={styles.orderNum}>
                <span className={styles.orderNumIcon}><Icon name="truck" /></span>
                משלוח | {o.number || o.id?.slice(0, 8)}
            </span>
            <span className={styles.cardTopMeta}>
                {addr && `${addr} • `}{formatDayWindow(o.window)} {o.window?.endTimestamp && <span style={{ marginInlineStart: 4 }}>◷ {formatDayWindow(o.window)}</span>}
            </span>
        </div>

        <div className={styles.cardMeta}>
            <span className={styles.metaItem}><Icon name="building" /> חנות: {o.storeName || o.storeId || '—'}</span>
            {street && <span className={styles.metaItem}><Icon name="map" /> {street}</span>}
            <span className={styles.metaItem}><Icon name="time" /> יום {formatDayWindow(o.window)}</span>
        </div>

        <div className={styles.cardMain}>
            <div className={styles.timeBlock}>
                <div className={styles.timeBig}>{formatTimeHM(o.window)}</div>
                <div className={styles.timeSub}>{o.status === 'done' ? 'סופק' : 'לסיום ליקוט'}</div>
            </div>

            <div className={styles.boxesRow}>
                <span className={styles.boxItem}>{(boxes.amount ?? 5)} <Icon name="bag" /></span>
                <span className={styles.boxItem}>{(boxes.cold ?? 2)} <span style={{ color: '#0e7490' }}>❄</span></span>
                <span className={styles.boxItem}>{(boxes.freeze ?? 2)} <Icon name="bag" /></span>
            </div>

            <div className={styles.progressWrap}>
                <div className={styles.progressTop}>{done}/{total}</div>
                <div className={styles.progressSub}>מוצרים שסופקו</div>
                <ProgressRing pct={pct} color={ringColor} />
            </div>
        </div>

        <div className={styles.cardFooter} data-foot={foot}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span className={styles.footerDot}>{variant === 'done' ? '✓' : variant === 'urgent' ? '!' : '○'}</span>
                {STATUS_LABEL[o.status] || o.status}
                {o.isMine && <span style={{ opacity: 0.7 }}>• שלי</span>}
            </span>
            <span className={styles.footerActions}>
                {o.status === 'paid' && <button className={`${styles.miniBtn} ${styles.miniBtnPrimary}`} onClick={() => onAction('claim', o)}>התחל ליקוט</button>}
                {o.status === 'picking' && o.isMine && <button className={`${styles.miniBtn} ${styles.miniBtnPrimary}`} onClick={() => onAction('pick', o)}>המשך ליקוט</button>}
                {o.status === 'picked' && <button className={`${styles.miniBtn} ${styles.miniBtnPrimary}`} onClick={() => onAction('pack', o)}>ארוז</button>}
                {o.status === 'packed' && <button className={styles.miniBtn} onClick={() => onAction('ship_select', o)}>בחר לשילוח</button>}
                {o.status === 'shipped' && <button className={styles.miniBtn} disabled={!canDeliver && !o.isMine} onClick={() => onAction('deliver', o)}>{canDeliver ? 'מסור' : 'מסירה'}</button>}
                <button className={styles.miniBtn} onClick={() => onAction('open', o)}>פתח</button>
            </span>
        </div>
    </div>
}

function OpsInner() {
    const { data, filter, setFilter } = useData()
    const { coords } = useGeolocation()
    const [mineOnly, setMineOnly] = useState(false)
    const [selectedShip, setSelectedShip] = useState({})
    const [pickOrder, setPickOrder] = useState(null)
    const [deliverOrder, setDeliverOrder] = useState(null)

    const rawOrders = useMemo(() => {
        const arr = Array.isArray(data) ? data : []
        return arr.filter(o => o.status !== 'cart')
    }, [data])

    const visible = useMemo(() => {
        if (!mineOnly) return rawOrders
        return rawOrders.filter(o => o.isMine)
    }, [rawOrders, mineOnly])

    const kanban = useMemo(() => {
        const pick = visible.filter(o => ['paid', 'picking', 'picked'].includes(o.status))
        const ship = visible.filter(o => ['packed', 'shipped'].includes(o.status))
        const done = visible.filter(o => ['done', 'canceled', 'failed'].includes(o.status))
        return { pick, ship, done }
    }, [visible])

    async function handle(action, o) {
        if (action === 'claim') {
            try { await apiReq('order/ops/claim', { id: o.id }); setPickOrder(o.id) } catch (e) { alert(String(e)) }
        } else if (action === 'pack') {
            const bags = { regular: 1 }; const boxes = {}
            try { await apiReq('order/ops/pack', { id: o.id, bags, boxes }) } catch (e) { alert(String(e)) }
        } else if (action === 'ship_select') {
            setSelectedShip(prev => ({ ...prev, [o.id]: !prev[o.id] }))
        } else if (action === 'open') {
            setPickOrder(o.id)
        } else if (action === 'pick') {
            setPickOrder(o.id)
        } else if (action === 'deliver') {
            setDeliverOrder(o)
        }
    }

    async function startShipment() {
        const ids = Object.keys(selectedShip).filter(k => selectedShip[k])
        if (!ids.length) return alert('בחר לפחות הזמנה אחת')
        try {
            const origin = coords || undefined
            const res = await apiReq('shipment/start', { orderIds: ids, coordinates: origin })
            if (res.failures?.length) alert('חלק מההזמנות לא זמינות: ' + res.failures.join(', '))
            try { await apiReq('shipment/route', { shipmentId: res.shipment.id, origin }) } catch { }
            setSelectedShip({})
        } catch (e) { alert(String(e)) }
    }

    return <>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
            <button className={mineOnly ? `${styles.miniBtn} ${styles.miniBtnPrimary}` : styles.miniBtn} onClick={() => setMineOnly(v => !v)}>
                {mineOnly ? 'שלי ✓' : 'הכל'}
            </button>
            <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 8 }}>
                <button className={`${styles.miniBtn} ${styles.miniBtnPrimary}`} onClick={startShipment}>התחל שילוח ({Object.values(selectedShip).filter(Boolean).length})</button>
            </span>
        </div>

        <div className={`${styles.kanban} ${styles.kanbanDesktopOnly}`} style={{ display: 'grid' }}>
            <div className={styles.column}>
                <div className={styles.columnHeader}>ליקוט <small>{kanban.pick.length}</small></div>
                <div className={styles.columnList}>
                    {kanban.pick.map(o => <OrderCard key={o.id} o={o} onAction={handle} coords={coords} />)}
                    {!kanban.pick.length && <div className={styles.empty}>אין הזמנות לליקוט</div>}
                </div>
            </div>
            <div className={styles.column}>
                <div className={styles.columnHeader}>שילוח <small>{kanban.ship.length}</small></div>
                <div className={styles.columnList}>
                    {kanban.ship.map(o => <OrderCard key={o.id} o={o} onAction={handle} coords={coords} />)}
                    {!kanban.ship.length && <div className={styles.empty}>אין הזמנות לשילוח</div>}
                </div>
            </div>
            <div className={styles.column}>
                <div className={styles.columnHeader}>סופק <small>{kanban.done.length}</small></div>
                <div className={styles.columnList}>
                    {kanban.done.map(o => <OrderCard key={o.id} o={o} onAction={handle} coords={coords} />)}
                    {!kanban.done.length && <div className={styles.empty}>אין הזמנות שסופקו</div>}
                </div>
            </div>
        </div>

        {/* <div className={styles.list}>
            {visible.map(o=> <OrderCard key={o.id} o={o} onAction={handle} coords={coords} />)}
            {!visible.length && <div className={styles.empty}>אין הזמנות</div>}
        </div> */}

        {pickOrder && <PickSheet orderId={pickOrder} onClose={() => setPickOrder(null)} />}
        {deliverOrder && <DeliverSheet order={deliverOrder} coords={coords} onClose={() => setDeliverOrder(null)} />}
    </>
}

export default function OpsPage() {
    const user = useUser()
    const [currentStore, setCurrentStore] = useState(user?.currentStoreId || null)
    useEffect(() => { if (user?.currentStoreId && !currentStore) setCurrentStore(user.currentStoreId) }, [user?.currentStoreId])

    if (!currentStore && !user?.currentStoreId) {
        return <div className={styles.ops}><StorePicker onSelected={id => setCurrentStore(id)} /></div>
    }

    const opsCols = [
        { key: 'number' },
        { key: 'status', type: 'tr' },
        { key: 'storeId' },
        { key: 'deliveryMethod', type: 'tr' },
        { key: 'window.date', type: 'tr' },
    ]

    return <div className={styles.ops}>
        <DataProvider apiRoute='order/ops' limit={50} defaultSort={{ 'window.endTimestamp': 1 }} cols={opsCols}>
            <FilterBar cols={opsCols} />
            <OpsInner />
        </DataProvider>
    </div>
}

function PickSheet({ orderId, onClose }) {
    const [order, setOrder] = useState(null)
    useEffect(() => { apiReq('order/id', { id: orderId }).then(setOrder).catch(() => { }) }, [orderId])
    if (!order) return <div className={styles.sheet}>טוען… <button onClick={onClose}>סגור</button></div>
    return <div className={styles.sheet}>
        <h3>ליקוט #{order.number} — {STATUS_LABEL[order.status] || order.status}</h3>
        {order.cart?.map(item => <PickRow key={item.barcode || item.id} item={item} orderId={orderId} onDone={() => apiReq('order/id', { id: orderId }).then(setOrder)} />)}
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className={`${styles.miniBtn} ${styles.miniBtnPrimary}`} onClick={async () => { try { await apiReq('order/ops/pick_complete', { id: orderId }); alert('נלקט'); onClose() } catch (e) { alert(String(e)) } }}>סיום ליקוט</button>
            <button className={styles.miniBtn} onClick={async () => { try { await apiReq('order/ops/release', { id: orderId }); onClose() } catch (e) { alert(String(e)) } }}>שחרר</button>
            <button className={styles.miniBtn} onClick={onClose}>סגור</button>
        </div>
    </div>
}

function PickRow({ item, orderId, onDone }) {
    const isWeighted = item.unit?.type === 'weight'
    const [val, setVal] = useState(item.finalAmount ?? '')
    async function doAction(action) {
        try {
            await apiReq('order/ops/pick_item', { id: orderId, barcode: item.barcode, action, finalAmount: Number(val), missingReason: action === 'missing' ? 'missing' : undefined })
            onDone()
        } catch (e) { alert(String(e)) }
    }
    return <div className={styles.pickRow}>
        <div>{item.name} — {item.amount} {isWeighted ? `(שקילה · ${item.unit?.baseUnit || 'kg'})` : ''} {item.barcode || <i>ללא ברקוד</i>}</div>
        {isWeighted ? <>
            <input type='number' step='0.01' placeholder='כמות שנשקלה' value={val} onChange={e => setVal(e.target.value)} />
            <button className={styles.miniBtn} onClick={() => doAction('weight')}>שמור שקילה</button>
            <button className={styles.miniBtn} onClick={() => doAction('missing')}>חסר</button>
        </> : <>
            <input type='number' value={val} onChange={e => setVal(e.target.value)} placeholder='כמות' />
            <button className={styles.miniBtn} onClick={() => doAction('scan')}>סרוק / שמור</button>
            <button className={styles.miniBtn} onClick={() => doAction('missing')}>חסר</button>
        </>}
        {item.missing && <span> — חסר</span>}
        {item.finalAmount != null && !item.missing && <span> — סופק {item.finalAmount}</span>}
    </div>
}

function DeliverSheet({ order, coords, onClose }) {
    const [file, setFile] = useState(null)
    const [preview, setPreview] = useState(null)
    async function submit(force = false) {
        if (!file) return alert('צלם תמונה')
        const reader = new FileReader()
        reader.onload = async () => {
            const base64 = String(reader.result).split(',')[1]
            try {
                await apiReq('shipment/deliver', { orderId: order.id, imageBase64: base64, coordinates: coords, force })
                onClose()
            } catch (e) { alert(String(e)) }
        }
        reader.readAsDataURL(file)
    }
    return <div className={styles.sheet}>
        <h3>מסירה #{order.number}</h3>
        <div>{order.address?.city} {order.address?.street} {order.address?.building}</div>
        <input type='file' accept='image/*' capture='environment' onChange={e => { const f = e.target.files[0]; setFile(f); if (f) setPreview(URL.createObjectURL(f)) }} />
        {preview && <img src={preview} alt='preview' style={{ maxWidth: '100%', marginTop: 8 }} />}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className={`${styles.miniBtn} ${styles.miniBtnPrimary}`} onClick={() => submit(false)}>שלח</button>
            <button className={styles.miniBtn} onClick={() => submit(true)}>שלח בכוח (חריגת GPS)</button>
            <button className={styles.miniBtn} onClick={onClose}>ביטול</button>
        </div>
    </div>
}
