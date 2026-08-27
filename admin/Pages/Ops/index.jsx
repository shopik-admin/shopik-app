import { useEffect, useMemo, useState } from 'react'
import apiReq from 'common/functions/apiReq'
import useGeolocation from 'common/functions/useGeolocation'
import distanceMeters from 'common/functions/distance'
import StorePicker from './StorePicker'
import { OPS_PROXIMITY_RADIUS_M } from 'common/constants'
import { useUser } from 'features/User'
import styles from './ops.module.css'

function formatWindow(w) {
    if (!w) return ''
    const d = w.endTimestamp ? new Date(w.endTimestamp) : null
    return d ? d.toLocaleString() : w.date || ''
}

function OrderCard({ o, onAction, coords }) {
    const isMine = o.isMine
    const addr = o.address ? `${o.address.city || ''} ${o.address.street || ''} ${o.address.building || ''}`.trim() : ''
    const dist = coords && o.address?.location?.coordinates ? Math.round(distanceMeters(coords, o.address.location.coordinates)) : null
    const canDeliver = o.status === 'shipped' && (dist != null ? dist <= OPS_PROXIMITY_RADIUS_M : false)
    return <div className={styles.card} style={{ borderLeft: isMine ? '4px solid #0a0' : undefined }}>
        <div className={styles.cardHead}>
            <b>#{o.number}</b> <span className={styles.status}>{o.status}</span> {isMine && <span className={styles.mine}>Mine</span>}
        </div>
        <div>{o.name?.first} {o.name?.last} — {o.phone}</div>
        <div>{addr}</div>
        <div>Window: {formatWindow(o.window)} {o.window?.endTimestamp && <Countdown end={o.window.endTimestamp} />}</div>
        <div>{o.cart?.length || 0} items — {o.finalSum ?? o.sum} ₪ {dist != null && <span>· {dist}m</span>}</div>
        <div className={styles.actions}>
            {o.status === 'paid' && <button onClick={()=>onAction('claim', o)}>Start picking</button>}
            {o.status === 'picking' && o.isMine && <button onClick={()=>onAction('pick', o)}>Continue picking</button>}
            {o.status === 'picked' && <button onClick={()=>onAction('pack', o)}>Pack</button>}
            {o.status === 'packed' && <button onClick={()=>onAction('ship_select', o)}>Select for shipment</button>}
            {o.status === 'shipped' && <button disabled={!canDeliver && !o.isMine} onClick={()=>onAction('deliver', o)}>{canDeliver ? 'Deliver (in range)' : 'Deliver'}</button>}
            <button onClick={()=>onAction('open', o)}>Open</button>
        </div>
    </div>
}

function Countdown({ end }) {
    const [now, setNow] = useState(Date.now())
    useEffect(()=>{ const id=setInterval(()=>setNow(Date.now()), 30000); return ()=>clearInterval(id)},[])
    const diff = new Date(end).getTime() - now
    if (diff <= 0) return <span style={{color:'red'}}>overdue</span>
    const mins = Math.floor(diff/60000)
    const h = Math.floor(mins/60), m = mins%60
    const urgent = diff < 60*60000
    return <span style={{color: urgent?'red':undefined}}>{h>0?`${h}h ${m}m`:`${m}m`} left</span>
}

export default function OpsPage() {
    const user = useUser()
    const { coords } = useGeolocation()
    const [orders, setOrders] = useState([])
    const [filter, setFilter] = useState('all')
    const [selectedShip, setSelectedShip] = useState({})
    const [currentStore, setCurrentStore] = useState(user?.currentStoreId || null)
    const [pickOrder, setPickOrder] = useState(null)
    const [shipOrders, setShipOrders] = useState([])
    const [deliverOrder, setDeliverOrder] = useState(null)
    const [error, setError] = useState(null)

    async function load() {
        try {
            const data = await apiReq('order/ops/list', { limit: 50 })
            setOrders(data || [])
        } catch (e) { setError(String(e)) }
    }
    useEffect(()=>{ if (currentStore || user?.currentStoreId) load(); const id=setInterval(load, 15000); return ()=>clearInterval(id)}, [currentStore])
    useEffect(()=>{ if (user?.currentStoreId && !currentStore) setCurrentStore(user.currentStoreId)},[user?.currentStoreId])

    const visible = useMemo(()=>{
        if (filter==='mine') return orders.filter(o=>o.isMine)
        if (filter==='paid') return orders.filter(o=>o.status==='paid')
        if (filter==='picked') return orders.filter(o=>o.status==='picked')
        if (filter==='packed') return orders.filter(o=>o.status==='packed')
        if (filter==='shipped') return orders.filter(o=>o.status==='shipped')
        return orders
    }, [orders, filter])

    async function handle(action, o) {
        if (action==='claim') {
            try { await apiReq('order/ops/claim', { id: o.id }); setPickOrder(o.id); await load() } catch(e){ alert(String(e)) }
        } else if (action==='pack') {
            const bags = { regular: 1 }; const boxes = {}
            try { await apiReq('order/ops/pack', { id: o.id, bags, boxes }); await load() } catch(e){ alert(String(e)) }
        } else if (action==='ship_select') {
            setSelectedShip(prev=> ({...prev, [o.id]: !prev[o.id]}))
        } else if (action==='open') {
            setPickOrder(o.id)
        } else if (action==='pick') {
            setPickOrder(o.id)
        } else if (action==='deliver') {
            setDeliverOrder(o)
        }
    }

    async function startShipment() {
        const ids = Object.keys(selectedShip).filter(k=>selectedShip[k])
        if (!ids.length) return alert('select at least one order')
        try {
            const origin = coords || undefined
            const res = await apiReq('shipment/start', { orderIds: ids, coordinates: origin })
            if (res.failures?.length) alert('Some orders unavailable: ' + res.failures.join(', '))
            // compute route
            try { await apiReq('shipment/route', { shipmentId: res.shipment.id, origin }) } catch {}
            setSelectedShip({})
            await load()
        } catch(e){ alert(String(e)) }
    }

    if (!currentStore && !user?.currentStoreId) {
        return <StorePicker onSelected={id=>setCurrentStore(id)} />
    }

    return <div className={styles.ops}>
        <div className={styles.filters}>
            {['all','mine','paid','picked','packed','shipped'].map(f=> <button key={f} className={filter===f?styles.active:''} onClick={()=>setFilter(f)}>{f}</button>)}
            <button onClick={load}>Refresh</button>
            <button onClick={startShipment}>Start shipment ({Object.values(selectedShip).filter(Boolean).length})</button>
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.list}>
            {visible.map(o=> <OrderCard key={o.id} o={o} onAction={handle} coords={coords} />)}
            {!visible.length && <div>No orders</div>}
        </div>
        {pickOrder && <PickSheet orderId={pickOrder} onClose={()=>{setPickOrder(null); load()}} />}
        {deliverOrder && <DeliverSheet order={deliverOrder} coords={coords} onClose={()=>{setDeliverOrder(null); load()}} />}
        <ShipTracker />
    </div>
}

function PickSheet({ orderId, onClose }) {
    const [order, setOrder] = useState(null)
    useEffect(()=>{ apiReq('order/id', { id: orderId }).then(setOrder).catch(()=>{}) },[orderId])
    if (!order) return <div className={styles.sheet}>Loading… <button onClick={onClose}>Close</button></div>
    return <div className={styles.sheet}>
        <h3>Pick #{order.number} — {order.status}</h3>
        {order.cart?.map(item=> <PickRow key={item.barcode} item={item} orderId={orderId} onDone={()=>apiReq('order/id',{id:orderId}).then(setOrder)} />)}
        <div style={{marginTop:12}}>
            <button onClick={async()=>{ try{ await apiReq('order/ops/pick_complete',{id:orderId}); alert('picked'); onClose()} catch(e){alert(String(e))} }}>Complete picking</button>
            <button onClick={async()=>{ try{ await apiReq('order/ops/release',{id:orderId}); onClose()} catch(e){alert(String(e))} }}>Release</button>
            <button onClick={onClose}>Close</button>
        </div>
    </div>
}

function PickRow({ item, orderId, onDone }) {
    const isWeighted = item.unit?.type === 'weight'
    const [val, setVal] = useState(item.finalAmount ?? '')
    async function doAction(action) {
        try {
            await apiReq('order/ops/pick_item', { id: orderId, barcode: item.barcode, action, finalAmount: Number(val), missingReason: action==='missing'?'missing':undefined })
            onDone()
        } catch(e){ alert(String(e)) }
    }
    return <div className={styles.pickRow}>
        <div>{item.name} — {item.amount} {isWeighted?`(weighed · ${item.unit?.baseUnit||'kg'})`:''} {item.barcode || <i>no barcode</i>}</div>
        {isWeighted ? <>
            <input type='number' step='0.01' placeholder='weighed amount' value={val} onChange={e=>setVal(e.target.value)} />
            <button onClick={()=>doAction('weight')}>Save weight</button>
            <button onClick={()=>doAction('missing')}>Missing</button>
        </> : <>
            <input type='number' value={val} onChange={e=>setVal(e.target.value)} placeholder='amount' />
            <button onClick={()=>doAction('scan')}>Scan / Save</button>
            <button onClick={()=>doAction('missing')}>Missing</button>
        </>}
        {item.missing && <span> — MISSING</span>}
        {item.finalAmount!=null && !item.missing && <span> — final {item.finalAmount}</span>}
    </div>
}

function DeliverSheet({ order, coords, onClose }) {
    const [file, setFile] = useState(null)
    const [preview, setPreview] = useState(null)
    async function submit(force=false) {
        if (!file) return alert('take a photo')
        const reader = new FileReader()
        reader.onload = async () => {
            const base64 = String(reader.result).split(',')[1]
            try {
                await apiReq('shipment/deliver', { orderId: order.id, imageBase64: base64, coordinates: coords, force })
                onClose()
            } catch(e){ alert(String(e)) }
        }
        reader.readAsDataURL(file)
    }
    return <div className={styles.sheet}>
        <h3>Deliver #{order.number}</h3>
        <div>{order.address?.city} {order.address?.street} {order.address?.building}</div>
        <input type='file' accept='image/*' capture='environment' onChange={e=>{ const f=e.target.files[0]; setFile(f); if(f) setPreview(URL.createObjectURL(f)) }} />
        {preview && <img src={preview} alt='preview' style={{maxWidth:'100%', marginTop:8}} />}
        <div>
            <button onClick={()=>submit(false)}>Submit</button>
            <button onClick={()=>submit(true)}>Force submit (GPS drift)</button>
            <button onClick={onClose}>Cancel</button>
        </div>
    </div>
}

function ShipTracker() {
    const { coords } = useGeolocation()
    // find active shipment for this shipper: we poll ops list for shipped mine
    useEffect(()=>{
        if (!coords) return
        // locate active shipment via shipper — we don't have direct endpoint, so we piggyback on location: try to discover via shipment in memory
        // Instead, we fetch active shipment ids by calling shipment/location only when we know shipmentId — tracker will be driven by ActiveShipment view.
    },[coords])
    return null
}
