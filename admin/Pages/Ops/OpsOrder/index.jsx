import { buildWazeUrl, DeliveryMethodTag, formatDepartureTime, formatWindow, isShippingStatus, RemainingTime } from '../orderUtils'
import classNames from 'common/functions/classNames'
import Button from 'common/components/Button'
import Loader from 'common/components/Loader'
import render from 'common/functions/render'
import useApi from 'common/functions/useApi'
import apiReq from 'common/functions/apiReq'
import styles from './opsOrder.module.css'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import Flex from 'common/components/Flex'
import { useNavigate, useParams } from 'react-router'
import { useUser } from 'features/User'
import { useState, useEffect } from 'react'
import Tabs from '#common/components/Tabs/index.jsx'
import ProductInline from 'common/components/ProductInline'
import Stepper from 'common/components/Stepper'
import { useModal } from 'common/components/Modal'
import ProductPickModal from './ProductPickModal'
import DeliverPhoto from './DeliverPhoto'
import { formatAmount } from 'common/components/Product'

const STEPS = {
    PREVIEW: 0,
    PICK: 1,
    PACK: 2,
    SHIP: 3,
    VIEW: 4,
    CONFIRM: 5,
    DELIVER: 6
}

const stepRenderer = [
    OrderPreview,
    OrderPick,
    OrderPack,
    OrderShip,
    OrderView,
    OrderConfirmBags,
    DeliverPhoto,
]

export default function OpsOrder({ }) {
    const [step, setStep] = useState(STEPS.PREVIEW)
    const StepComponent = stepRenderer[step] || null
    const { orderId } = useParams()
    const { error, loading, data = [], setData } = useApi(`order/ops/read`, { filter: { id: orderId } })
    const order = data[0] || {}
    const { id } = useUser()
    const isMine = id == order.picker?.adminId,
        cantPick = !isMine && order.picker?.adminId,
        isShipMine = id == order.shipper?.adminId,
        cantShip = !isShipMine && order.shipper?.adminId
    const navigate = useNavigate()

    useEffect(() => {
        if (loading || !order?.status) return
        if (order.status === 'picked' && step === STEPS.PREVIEW) setStep(STEPS.PACK)
        else if (order.status === 'picking' && step === STEPS.PREVIEW && isMine) setStep(STEPS.PICK)
    }, [order.status, loading, isMine])


    if (loading) return <Loader />
    if (error) return <Text center mode='error'>{error.message}</Text>
    if (!order) return <Text center mode='error'>No order found</Text>
    async function claimOrder() {
        try {
            const res = await apiReq('order/ops/claim', { id: order.id })
            // apiReq returns the payload directly (throws on error):
            // server returns the updated order doc itself, not wrapped in data
            const newDoc = res?.cart ? res : res?.data || res
            if (newDoc?.id) setData([newDoc])
            setStep(STEPS.PICK)
        } catch (e) {
            alert(e.message || 'claim failed')
        }
    }
    function handlePicked(updatedOrder) {
        if (updatedOrder) {
            // server returns updated order doc directly, or wrapped in data
            const newDoc = updatedOrder.cart ? updatedOrder : updatedOrder.data || updatedOrder
            if (newDoc?.id) setData([newDoc])
            else setData(prev => prev)
        }
    }

    return <div className={styles.opsOrder}>
        <Flex gap={15} alignItem='center' className={styles.orderTitle}>
            <Button icon='back' mode='text' onClick={() => navigate('/ops')} />
            <Text size='h3' bold >הזמנה {order.number}</Text>
        </Flex>
        {StepComponent ? <StepComponent
            order={order}
            claimOrder={claimOrder}
            isMine={isMine}
            cantPick={cantPick}
            isShipMine={isShipMine}
            cantShip={cantShip}
            setStep={setStep}
            goPreview={() => setStep(STEPS.PREVIEW)}
            onPicked={handlePicked}
        /> : null}
    </div>
}

function OrderPreview({ order = {}, claimOrder, isMine, cantPick, isShipMine, cantShip, setStep }) {
    const windowTime = formatWindow(order.window)

    if (order.status === 'shipped') {
        const deliveryTime = formatDepartureTime(order.window),
            isFirstOrder = order.userOrderNumber === 1,
            isCompletionOrder = !!order.orderRestoredFrom,
            hasPills = isFirstOrder || isCompletionOrder

        return <Flex col className={styles.orderPreview}>
            <Flex grow col gap={30}>
                <Flex alignItems='center' justifyContent='space-between' style={{ padding: 25, paddingBottom: 0, fontSize: 20 }}>
                    <DeliveryMethodTag deliveryMethod={order.deliveryMethod} />
                    <Text bold size='l'>{order.number}</Text>
                </Flex>
                {hasPills && <Flex gap={10} className={styles.pills}>
                    {isCompletionOrder && <Flex center className={styles.pill}><Text size='s'>ops_completion_order</Text></Flex>}
                    {isFirstOrder && <Flex center className={styles.pill}><Text size='s'>ops_first_order</Text></Flex>}
                </Flex>}
                <Flex gap={10} className={classNames(styles.intro, styles[windowTime.isLate ? 'danger' : windowTime.isAlmostLate ? 'warning' : 'success'])}>
                    <Icon name='time' size={24} />
                    <Flex col gap={10} grow>
                        <Flex alignItems='center' justifyContent='space-between' grow>
                            <Text size='h2' bold>ops_delivery_title</Text>
                            <Text size='h2' bold>{deliveryTime}</Text>
                        </Flex>
                        <Flex gap={5}>
                            <Text size='m' className={styles.subtitle}>ops_departure_remaining</Text>
                            <RemainingTime size='m' className={styles.subtitle} window={order.window} />
                        </Flex>
                    </Flex>
                </Flex>
                <Flex col gap={25} className={styles.priviewRows}>
                    <PriviewRow icon='user' label='customer_name' value={render({ type: 'name', value: order.name })} />
                    <PriviewRow
                        icon='location'
                        label='customer_address'
                        value={render({ type: 'address', value: order.address })}
                        actionIcon={(order.address?.location?.coordinates?.length || order.address?.street || order.address?.city) ? 'waze' : null}
                        onAction={() => window.open(buildWazeUrl(order.address), '_blank', 'noopener')}
                    />
                    <PriviewRow icon='time' label='order_window' value={windowTime.textLong} />
                    {order.shipperComment && <PriviewRow icon='note' label='ops_shipper_notes' value={order.shipperComment} />}
                    {order.phone && <PriviewRow
                        icon='phone'
                        label='ops_customer_phone'
                        value={order.phone}
                        actionIcon='phoneOutgoing'
                        onAction={() => { window.location.href = `tel:${String(order.phone).replace(/[^+\d]/g, '')}` }}
                    />}
                </Flex>
            </Flex>
            <Flex center gap={20} col className={styles.footer}>
                <Button className={styles.startPickingBtn} disabled={cantShip} onClick={() => setStep(STEPS.DELIVER)}>ops_order_delivered</Button>
                <Button mode='text-brand' onClick={() => setStep(STEPS.VIEW)}>ops_view_order_only</Button>
            </Flex>
        </Flex>
    }

    if (isShippingStatus(order.status)) {
        const departureTime = formatDepartureTime(order.window),
            isFirstOrder = order.userOrderNumber === 1,
            isCompletionOrder = !!order.orderRestoredFrom,
            hasPills = isFirstOrder || isCompletionOrder

        return <Flex col className={styles.orderPreview}>
            <Flex grow col gap={30}>
                <Flex alignItems='center' justifyContent='space-between' style={{ padding: 25, paddingBottom: 0, fontSize: 20 }}>
                    <DeliveryMethodTag deliveryMethod={order.deliveryMethod} />
                    <Text bold size='l'>{order.number}</Text>
                </Flex>
                {hasPills && <Flex gap={10} className={styles.pills}>
                    {isCompletionOrder && <Flex center className={styles.pill}><Text size='s'>ops_completion_order</Text></Flex>}
                    {isFirstOrder && <Flex center className={styles.pill}><Text size='s'>ops_first_order</Text></Flex>}
                </Flex>}
                <Flex gap={10} className={classNames(styles.intro, styles[windowTime.isLate ? 'danger' : windowTime.isAlmostLate ? 'warning' : 'success'])}>
                    <Icon name='time' size={24} />
                    <Flex col gap={10} grow>
                        <Flex alignItems='center' justifyContent='space-between' grow>
                            <Text size='h2' bold>ops_departure_title</Text>
                            <Text size='h2' bold>{departureTime}</Text>
                        </Flex>
                        <Flex gap={5}>
                            <Text size='m' className={styles.subtitle}>ops_departure_remaining</Text>
                            <RemainingTime size='m' className={styles.subtitle} window={order.window} />
                        </Flex>
                    </Flex>
                </Flex>
                <Flex col gap={25} className={styles.priviewRows}>
                    <PriviewRow icon='user' label='customer_name' value={order.phone || '0500000000'} />
                    <PriviewRow icon='location' label='customer_address' value={render({ type: 'address', value: order.address })} />
                    <PriviewRow icon='time' label='order_window' value={windowTime.textLong} />
                    {order.shipperComment && <PriviewRow icon='note' label='ops_shipper_notes' value={order.shipperComment} />}
                </Flex>
            </Flex>
            <Flex center gap={20} col className={styles.footer}>
                <Button className={styles.startPickingBtn} disabled={cantShip} onClick={isShipMine ? () => setStep(STEPS.VIEW) : () => setStep(STEPS.CONFIRM)}>ops_take_order</Button>
                <Button mode='text-brand' onClick={() => setStep(STEPS.VIEW)}>ops_view_order_only</Button>
            </Flex>
        </Flex>
    }

    return <Flex col className={styles.orderPreview}>
        <Flex grow col gap={30}>
            <Flex alignItems='center' justifyContent='space-between' style={{ padding: 25, paddingBottom: 0, fontSize: 20 }}>
                <DeliveryMethodTag deliveryMethod={order.deliveryMethod} />
                <Text bold size='l'>{order.number}</Text>
            </Flex>
            <Flex gap={10} className={classNames(styles.intro, styles[windowTime.isLate ? 'danger' : windowTime.isAlmostLate ? 'warning' : 'success'])}>
                <Icon name='time' size={24} />
                <Flex col gap={10} grow>
                    <Flex alignItems='center' justifyContent='space-between' grow>
                        <Text size='h2' bold>time_to_pick_title</Text>
                        <Text size='h2' bold>{order.window?.end}:00</Text>
                    </Flex>
                    <Flex gap={5}>
                        <Text size='m' className={styles.subtitle}>time_to_pick_subtitle</Text>
                        <RemainingTime size='m' className={styles.subtitle} window={order.window} />
                    </Flex>
                </Flex>
            </Flex>
            <Flex col gap={25} className={styles.priviewRows}>
                <PriviewRow icon='user' label='customer_name' value={order.phone || '0500000000'} />
                <PriviewRow icon='location' label='customer_address' value={render({ type: 'address', value: order.address })} />
                <PriviewRow icon='time' label='order_window' value={windowTime.textLong} />
                {/* <PriviewRow icon='replace' label='replace_and_missing' value={order.window?.replace} />
                <PriviewRow icon='note' label='pick_notes' value={order.comments} /> */}
            </Flex>
        </Flex>
        <Flex center gap={20} col className={styles.footer}>
            <Button className={styles.startPickingBtn} disabled={cantPick} onClick={isMine ? () => setStep(STEPS.PICK) : claimOrder}>{'start picking'}</Button>
            <Button mode='text-brand' onClick={() => setStep(STEPS.VIEW)}>view order</Button>
        </Flex>
    </Flex>
}

function OrderView({ order = {}, setStep }) {
    const cart = order.cart || []

    return <Flex grow col className={styles.orderPick}>
        <Flex alignItems='center' justifyContent='center' style={{ padding: 16 }}>
            <Text size='l' bold>ops_view_title</Text>
        </Flex>
        <Flex grow col gap={10} className={styles.cartList}>
            {cart.map(product => (
                <ProductInline
                    key={product.id || product.barcode}
                    product={product}
                    remove={false}
                    note={false}
                    admin
                />
            ))}
        </Flex>
        <Flex center gap={20} className={styles.footer}>
            <Button mode='text-brand' onClick={() => setStep(STEPS.PREVIEW)}>back</Button>
        </Flex>
    </Flex>
}

function PriviewRow({ icon, label, value, actionIcon, onAction }) {
    return <Flex gap={10} alignItems={value ? 'start' : 'center'} justifyContent='space-between' className={styles.priviewRow}>
        <Flex gap={10} alignItems={value ? 'start' : 'center'}>
            <Icon name={icon} size={24} />
            <Flex col gap={5} >
                <Text size='l' bold>{label}</Text>
                {value ? <Text >{value}</Text> : null}
            </Flex>
        </Flex>
        {actionIcon && <Button mode='text' icon={actionIcon} onClick={onAction} className={styles.rowAction} />}
    </Flex>
}

function OrderPick({ order = {}, setStep, onPicked }) {
    const [tab, setTab] = useState()
    const [completing, setCompleting] = useState(false)
    const { openModal, closeModal } = useModal()
    const cart = order.cart || []
    const isScanned = p => p.finalAmount != null || !!p.missing
    // group replaced originals with their replacer into one yellow linked card (image-3 style)
    const byBarcode = new Map(cart.map(p => [p.barcode, p]))
    const replacedPairs = []
    const pairedBarcodes = new Set()
    for (const p of cart) {
        const repBarcode = p.replacement?.replacementBarcode
        if (p.missing && repBarcode && byBarcode.has(repBarcode)) {
            replacedPairs.push({ original: p, replacer: byBarcode.get(repBarcode) })
            pairedBarcodes.add(p.barcode)
            pairedBarcodes.add(repBarcode)
        }
    }
    const toPickItems = cart.filter(p => !isScanned(p) && !pairedBarcodes.has(p.barcode))
    const donePickItems = cart.filter(p => isScanned(p) && !pairedBarcodes.has(p.barcode))
    const isDoneTab = tab === 'done_pick'
    const isWaitTab = tab === 'wait_pick'
    const displayed = isDoneTab ? donePickItems : isWaitTab ? [] : toPickItems
    const displayedPairs = isDoneTab ? replacedPairs : []
    const allHandled = toPickItems.length === 0 && cart.length > 0


    useEffect(() => {
        if (toPickItems.length === 0 && donePickItems.length > 0 && !isDoneTab) setTab('done_pick')
    }, [toPickItems.length, donePickItems.length])

    function handleProductClick(product) {
        openModal(
            <ProductPickModal product={product} orderId={order.id} onClose={() => closeModal()} onPicked={onPicked} />,
            { fullScreen: true, className: styles.pickModal }
        )
    }

    async function handleFinishPick() {
        if (!allHandled || completing) return
        setCompleting(true)
        try {
            const res = await apiReq('order/ops/pick_complete', { id: order.id })
            if (res?.error) {
                alert(res.error)
                return
            }
            const updated = res?.data || res
            if (updated?.id || updated?.cart) onPicked?.(updated)
            setStep(STEPS.PACK)
        } catch (e) {
            alert(e.message || 'pick_complete failed')
        } finally {
            setCompleting(false)
        }
    }

    return <Flex grow col className={styles.orderPick}>
        <Tabs
            className={styles.tabs}
            onChange={setTab}
            active={tab}
            mode='line'
            options={[
                { text: 'to_pick', badge: toPickItems.length },
                { text: 'wait_pick', badge: 0 },
                { text: 'done_pick', badge: donePickItems.length + replacedPairs.length },
            ]} />
        <Flex grow col gap={10} className={styles.cartList}>
            {displayedPairs.map(({ original, replacer }) => (
                <ReplacementCard
                    key={(original.id || original.barcode) + '->' + (replacer.id || replacer.barcode)}
                    original={original}
                    replacer={replacer}
                    onClick={() => handleProductClick(replacer)}
                />
            ))}
            {displayed.map(product => (
                <ProductInline
                    key={product.id || product.barcode}
                    product={product}
                    remove={false}
                    note={false}
                    admin
                    onClick={() => handleProductClick(product)}
                    style={{ cursor: 'pointer' }}
                />
            ))}
        </Flex>
        <Flex center gap={20} className={styles.footer}>
            <Button disabled={!allHandled} loading={completing} onClick={handleFinishPick} className={styles.finishBtn}>finish_pick</Button>
        </Flex>
    </Flex>
}

function ReplacementCard({ original = {}, replacer = {}, onClick }) {
    return <Flex col gap={8} onClick={onClick} style={{ cursor: 'pointer' }} className={styles.replacedCard}>
        <Flex alignItems="center" gap={6}>
            <Icon name="replace" size={16} />
            <Text size="s" bold>הוחלף</Text>
        </Flex>
        <Text size="xs" mode="sub">מקורי: {original.name || 'מוצר'} • הוזמן: {formatAmount(original, original.amount ?? 1)}</Text>
        <ProductInline
            product={replacer}
            remove={false}
            note={false}
            admin
        />
    </Flex>
}

function OrderPack({ order = {}, setStep, onPicked }) {
    const [loading, setLoading] = useState(false)
    const [packError, setPackError] = useState(null)
    const [regular, setRegular] = useState(order.bags?.regular ?? 0)
    const [cold, setCold] = useState(order.bags?.cold ?? 0)
    const [freeze, setFreeze] = useState(order.bags?.freeze ?? 0)

    async function handleTransfer() {
        if (loading) return
        setLoading(true)
        setPackError(null)
        try {
            const bags = {
                regular: Number(regular) || 0,
                cold: Number(cold) || 0,
                freeze: Number(freeze) || 0,
            }
            const res = await apiReq('order/ops/pack', { id: order.id, bags })
            const updated = res?.data || res
            if (updated?.id) onPicked?.(updated)
            setStep(STEPS.SHIP)
        } catch (e) {
            setPackError(e)
        } finally {
            setLoading(false)
        }
    }

    const chargeAmount = packError?.amount ?? order.finalSumWithShipping ?? order.sumWithShipping ?? order.finalSum ?? order.sum

    return <Flex grow col className={styles.orderPack}>
        <Flex col gap={6} className={styles.packInstruction}>
            <Text bold size="m">נא להזין כמות אריזות מדויקת בסיום האריזה</Text>
        </Flex>
        {packError ? <Flex col gap={8} className={styles.packError}>
            <Text bold size="m" mode="error">החיוב נכשל — ההזמנה לא נארזה</Text>
            <Text size="s" mode="error">{packError.message || 'שגיאת תשלום'}</Text>
            {chargeAmount ? <Text size="s">סכום לחיוב: ₪{chargeAmount}</Text> : null}
            {packError.capturedTotal > 0 ? <Text size="s">כבר חויב: ₪{packError.capturedTotal}{packError.delta > 0 ? `, נותר: ₪${packError.delta}` : null}</Text> : null}
            {order.payment?.last4digits ? <Text size="s">כרטיס: ****{order.payment.last4digits}</Text> : null}
            {packError.providerCode !== undefined ? <Text size="s">קוד שגיאה: {packError.providerCode}</Text> : null}
            <Button mode="text-brand" onClick={handleTransfer}>נסה שוב</Button>
        </Flex> : null}

        <Flex col gap={14} className={styles.packList}>
            <Flex justifyContent="space-between" alignItems="center" className={styles.packRow}>
                <Flex gap={8} alignItems="center">
                    <Icon name="box" size={20} className={styles.packIcon} />
                    <Text size="s">כמות אריזות</Text>
                </Flex>
                <Stepper value={regular} onChange={setRegular} />
            </Flex>
            <Flex justifyContent="space-between" alignItems="center" className={styles.packRow}>
                <Flex gap={8} alignItems="center">
                    <Icon name="snow" size={20} className={styles.packIcon} />
                    <Text size="s">כמות צידניות</Text>
                </Flex>
                <Stepper value={cold} onChange={setCold} />
            </Flex>
            <Flex justifyContent="space-between" alignItems="center" className={styles.packRow}>
                <Flex gap={8} alignItems="center">
                    <Icon name="bag" size={20} className={styles.packIcon} />
                    <Text size="s">כמות נלווים</Text>
                </Flex>
                <Stepper value={freeze} onChange={setFreeze} />
            </Flex>
        </Flex>

        <Flex center className={styles.footer}>
            <Button loading={loading} onClick={handleTransfer} className={styles.transferBtn}>העברה למשלוח</Button>
        </Flex>
    </Flex>
}

function OrderConfirmBags({ order = {}, setStep }) {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(false)
    const [touched, setTouched] = useState(false)
    const [regular, setRegular] = useState(0)
    const [cold, setCold] = useState(0)
    const [other, setOther] = useState(0)

    const expected = {
        regular: order.bags?.regular ?? 0,
        cold: order.bags?.cold ?? 0,
        other: order.bags?.freeze ?? order.bags?.extra ?? 0,
    }
    const match = regular === expected.regular && cold === expected.cold && other === expected.other
    const canAssign = touched && match

    function handleChange(setter) {
        return (v) => { setTouched(true); setter(v) }
    }

    async function handleAssign() {
        if (!canAssign || loading) return
        setLoading(true)
        try {
            const res = await apiReq('shipment/start', { orderIds: [order.id] })
            if (res?.failures?.length && !res?.successIds?.length) {
                alert(res.failures.join(', ') || 'shipment/start failed')
                return
            }
            navigate('/ops')
        } catch (e) {
            alert(e.message || 'shipment/start failed')
        } finally {
            setLoading(false)
        }
    }

    return <Flex grow col className={styles.orderPack}>
        <Flex col gap={6} className={styles.packInstruction}>
            <Text bold size="m">ops_confirm_bags_title</Text>
        </Flex>

        <Flex col gap={14} className={styles.packList}>
            <ConfirmRow icon="box" label="ops_bags_regular" value={regular} onChange={handleChange(setRegular)} expected={expected.regular} />
            <ConfirmRow icon="snow" label="ops_bags_cold" value={cold} onChange={handleChange(setCold)} expected={expected.cold} />
            <ConfirmRow icon="bag" label="ops_bags_other" value={other} onChange={handleChange(setOther)} expected={expected.other} />
        </Flex>

        <Flex center gap={20} col className={styles.footer}>
            <Flex center className={styles.confirmErrorSlot}>
                {touched && !match && <Text size="s" mode="error" center>ops_bags_mismatch</Text>}
            </Flex>
            <Button loading={loading} disabled={!canAssign} onClick={handleAssign} className={styles.transferBtn}>ops_assign_to_me</Button>
            <Button mode='text-brand' onClick={() => setStep(STEPS.PREVIEW)}>back</Button>
        </Flex>
    </Flex>
}

function ConfirmRow({ icon, label, value, onChange, expected }) {
    return <Flex justifyContent="space-between" alignItems="center" className={styles.packRow}>
        <Flex gap={8} alignItems="center">
            <Icon name={icon} size={20} className={styles.packIcon} />
            <Text size="s">{label}</Text>
        </Flex>
        <Flex gap={10} alignItems="center">
            <Flex gap={4} alignItems="center" className={styles.expected}>
                <Text size="s" mode="sub">ops_expected</Text>
                <Text size="s" bold>{expected}</Text>
            </Flex>
            <Stepper value={value} onChange={onChange} />
        </Flex>
    </Flex>
}

function OrderShip({ order = {} }) {
    return <Flex>
        <Text>ship</Text>
    </Flex>
}
