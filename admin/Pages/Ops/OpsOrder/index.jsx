import { buildWazeUrl, customerNotes, DeliveryMethodTag, formatDepartureTime, formatFullAddress, formatWindow, isClosedOrder, isShippingStatus, RemainingTime, shortNumber } from '../orderUtils'
import classNames from 'common/functions/classNames'
import TR from 'common/texts/TR.js'
import Button from 'common/components/Button'
import Loader from 'common/components/Loader'
import render from 'common/functions/render'
import useApi from 'common/functions/useApi'
import apiReq from 'common/functions/apiReq'
import styles from './opsOrder.module.css'
import Text from 'common/components/Text'
import Icon from 'common/components/Icon'
import Flex from 'common/components/Flex'
import { useLocation, useNavigate, useParams } from 'react-router'
import { useUser } from 'features/User'
import usePermission from 'common/permissions/usePermision'
import { useState, useEffect } from 'react'
import Tabs from '#common/components/Tabs/index.jsx'
import ProductInline from 'common/components/ProductInline'
import ReplacementCard from 'common/components/ReplacementCard'
import { groupCart } from 'common/functions/cartReplacements'
import Stepper from 'common/components/Stepper'
import { useModal } from 'common/components/Modal'
import ProductPickModal from './ProductPickModal'
import DeliverPhoto from './DeliverPhoto'
import ReleaseOrderButton from './ReleaseOrderButton'

const STEPS = {
    PREVIEW: 0,
    PICK: 1,
    PACK: 2,
    VIEW: 3,
    CONFIRM: 4,
    DELIVER: 5
}

const stepRenderer = [
    OrderPreview,
    OrderPick,
    OrderPack,
    OrderView,
    OrderConfirmBags,
    DeliverPhoto,
]

// URL key for each screen. The order URL itself is the details page and carries
// no step, so it is always the level between the list and the order screens.
const STEP_KEYS = ['', 'pick', 'pack', 'view', 'confirm', 'deliver']

export default function OpsOrder({ }) {
    const { orderId } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const step = STEPS[(new URLSearchParams(location.search).get('step') || '').toUpperCase()] ?? STEPS.PREVIEW
    const isSubStep = step !== STEPS.PREVIEW
    const StepComponent = stepRenderer[step] || null
    const { error, loading, data = [], setData } = useApi(`order/ops/read`, { filter: { id: orderId } })
    const order = data[0] || {}
    const { id, isSuperAdmin } = useUser()
    const canManagePick = usePermission('order:pick:manage')
    const isMine = id == order.picker?.adminId,
        cantPick = !isMine && order.picker?.adminId,
        isShipMine = id == order.shipper?.adminId,
        cantShip = !isShipMine && order.shipper?.adminId

    // Entering an order screen from the details page pushes, so back returns to
    // the details page; moving between order screens replaces, so they never
    // stack — back always goes straight back to the details page.
    function setStep(name, { replace } = {}) {
        if (name === step) return
        if (name === STEPS.PREVIEW) {
            navigate(-1)
            return
        }
        navigate(
            { pathname: location.pathname, search: `step=${STEP_KEYS[name]}` },
            { replace: replace || isSubStep }
        )
    }

    // No auto-jump: the details page is the level between the list and every
    // order screen, for every status.


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

    function handleReleased(updatedOrder) {
        handlePicked(updatedOrder)
        setStep(STEPS.PREVIEW)
    }

    // Any order screen returns to the details page, and the details page returns
    // to the queue — the same hierarchy the OS back button walks.
    function handleBack() {
        if (isSubStep) navigate(-1)
        else navigate('/ops')
    }

    return <div className={styles.opsOrder}>
        <Flex gap={15} alignItems='center' className={styles.orderTitle}>
            <Button icon='back' mode='text' onClick={handleBack} />
            <Text size='h3' bold >{TR('ops_order_with_number', { number: shortNumber(order.number) })}</Text>
        </Flex>
        {StepComponent ? <StepComponent
            order={order}
            claimOrder={claimOrder}
            isMine={isMine}
            cantPick={cantPick}
            isShipMine={isShipMine}
            cantShip={cantShip}
            isSuperAdmin={isSuperAdmin}
            canManagePick={canManagePick}
            setStep={setStep}
            goPreview={() => setStep(STEPS.PREVIEW)}
            onPicked={handlePicked}
            onReleased={handleReleased}
        /> : null}
    </div>
}

function OrderPreview({ order = {}, claimOrder, isMine, cantPick, isShipMine, cantShip, isSuperAdmin, canManagePick, onReleased, setStep }) {
    const windowTime = formatWindow(order.window)
    const notes = customerNotes(order)
    const isPicking = order.status === 'picking'
    const isPicked = order.status === 'picked'
    // Picking and picked orders can both be released back to the picking queue.
    const canRelease = isPicking || isPicked
    const canReleaseOwn = canRelease && isMine
    const canReleaseOther = canRelease && !isMine && order.picker?.adminId && canManagePick
    // A closed order has nothing left to work: nothing to claim, pick or deliver, so
    // the only thing the screen can offer is viewing it.
    const isClosed = isClosedOrder(order.status)

    if (order.status === 'shipped') {
        return <PreviewShell
            order={order}
            windowTime={windowTime}
            bannerTitleKey='ops_delivery_title'
            bannerTime={formatDepartureTime(order.window)}
            bannerSubtitleKey='ops_departure_remaining'
            rows={<>
                <PriviewRow icon='user' label='customer_name' value={render({ type: 'name', value: order.name })} />
                {order.phone && <PriviewRow
                    icon='phone'
                    label='ops_customer_phone'
                    value={order.phone}
                    actionIcon='phoneOutgoing'
                    actionTooltip='ops_call'
                    onAction={() => { window.location.href = `tel:${String(order.phone).replace(/[^+\d]/g, '')}` }}
                />}
                <PriviewRow
                    icon='location'
                    label='customer_address'
                    value={formatFullAddress(order.address)}
                    actionIcon={(order.address?.location?.coordinates?.length || order.address?.street || order.address?.city) ? 'waze' : null}
                    actionTooltip='ops_navigate'
                    onAction={() => window.open(buildWazeUrl(order.address), '_blank', 'noopener')}
                />
                <ElevatorRow order={order} />
                <PriviewRow icon='time' label='order_window' value={windowTime.textLong} />
                {notes && <PriviewRow icon='note' label='ops_customer_notes' value={notes} />}
                {order.shipperComment && <PriviewRow icon='note' label='ops_shipper_notes' value={order.shipperComment} />}
                <HandlerBlock picker={order.picker} shipper={order.shipper} />
            </>}
            footer={<PreviewFooter
                primaryKey='ops_order_delivered'
                primaryDisabled={cantShip && !isSuperAdmin}
                onPrimary={() => setStep(STEPS.DELIVER)}
                linkKey='ops_view_order_only'
                onLink={() => setStep(STEPS.VIEW)}
            />}
        />
    }

    if (isShippingStatus(order.status)) {
        return <PreviewShell
            order={order}
            windowTime={windowTime}
            bannerTitleKey='ops_departure_title'
            bannerTime={formatDepartureTime(order.window)}
            bannerSubtitleKey='ops_departure_remaining'
            rows={<>
                <PriviewRow icon='user' label='customer_name' value={render({ type: 'name', value: order.name })} />
                {order.phone && <PriviewRow
                    icon='phone'
                    label='ops_customer_phone'
                    value={order.phone}
                    actionIcon='phoneOutgoing'
                    actionTooltip='ops_call'
                    onAction={() => { window.location.href = `tel:${String(order.phone).replace(/[^+\d]/g, '')}` }}
                />}
                <PriviewRow
                    icon='location'
                    label='customer_address'
                    value={formatFullAddress(order.address)}
                    actionIcon={(order.address?.location?.coordinates?.length || order.address?.street || order.address?.city) ? 'waze' : null}
                    actionTooltip='ops_navigate'
                    onAction={() => window.open(buildWazeUrl(order.address), '_blank', 'noopener')}
                />
                <ElevatorRow order={order} />
                <PriviewRow icon='time' label='order_window' value={windowTime.textLong} />
                {notes && <PriviewRow icon='note' label='ops_customer_notes' value={notes} />}
                {order.shipperComment && <PriviewRow icon='note' label='ops_shipper_notes' value={order.shipperComment} />}
                <HandlerBlock picker={order.picker} shipper={order.shipper} />

            </>}
            footer={<PreviewFooter
                primaryKey='ops_take_order'
                primaryDisabled={cantShip}
                onPrimary={isShipMine ? () => setStep(STEPS.VIEW) : () => setStep(STEPS.CONFIRM)}
                linkKey='ops_view_order_only'
                onLink={() => setStep(STEPS.VIEW)}
            />}
        />
    }

    return <PreviewShell
        order={order}
        windowTime={windowTime}
        bannerTitleKey='time_to_pick_title'
        bannerTime={`${order.window?.end}:00`}
        bannerSubtitleKey='time_to_pick_subtitle'
        rows={<>
            <PriviewRow icon='user' label='customer_name' value={render({ type: 'name', value: order.name })} />
            {order.phone && <PriviewRow
                icon='phone'
                label='ops_customer_phone'
                value={order.phone}
                actionIcon='phoneOutgoing'
                actionTooltip='ops_call'
                onAction={() => { window.location.href = `tel:${String(order.phone).replace(/[^+\d]/g, '')}` }}
            />}
            <PriviewRow icon='location' label='customer_address' value={render({ type: 'address', value: order.address })} />
            <ElevatorRow order={order} />
            <PriviewRow icon='time' label='order_window' value={windowTime.textLong} />
            <HandlerBlock picker={order.picker} shipper={order.shipper} />
            {/* <PriviewRow icon='replace' label='replace_and_missing' value={order.window?.replace} />
            <PriviewRow icon='note' label='pick_notes' value={order.comments} /> */}
        </>}
        footer={<PreviewFooter
            primaryKey={isClosed ? null : isPicked ? 'ops_continue_pack' : canReleaseOwn ? 'ops_continue_picking' : 'start picking'}
            primaryDisabled={cantPick}
            onPrimary={isClosed ? null : isPicked ? () => setStep(STEPS.PACK) : isMine ? () => setStep(STEPS.PICK) : claimOrder}
            extra={canReleaseOwn
                ? <ReleaseOrderButton
                    orderId={order.id}
                    label='ops_release_order'
                    q={TR('ops_release_own_confirm')}
                    onReleased={onReleased}
                />
                : canReleaseOther
                    ? <ReleaseOrderButton
                        orderId={order.id}
                        label='ops_release_picker'
                        q={order.picker?.name
                            ? TR('ops_release_confirm', { name: order.picker.name })
                            : TR('ops_release_own_confirm')}
                        onReleased={onReleased}
                    />
                    : null}
            linkKey={canReleaseOwn ? null : 'view order'}
            onLink={() => setStep(STEPS.VIEW)}
        />}
    />
}

function PreviewShell({ order = {}, windowTime = {}, bannerTitleKey, bannerTime, bannerSubtitleKey, rows, footer }) {
    const pills = []
    if (order.orderRestoredFrom) pills.push('ops_completion_order')
    if (order.userOrderNumber === 1) pills.push('ops_first_order')

    return <Flex col className={styles.orderPreview}>
        <Flex grow col gap={30}>
            <Flex alignItems='center' justifyContent='space-between' style={{ padding: 25, paddingBottom: 0, fontSize: 20 }}>
                <DeliveryMethodTag deliveryMethod={order.deliveryMethod} />
                <Text bold size='l'>{shortNumber(order.number)}</Text>
            </Flex>
            {pills.length > 0 && <Flex gap={10} className={styles.pills}>
                {pills.map(key => <Flex key={key} center className={styles.pill}><Text size='s'>{key}</Text></Flex>)}
            </Flex>}
            <Flex gap={10} className={classNames(styles.intro, styles[windowTime.isLate ? 'danger' : windowTime.isAlmostLate ? 'warning' : 'success'])}>
                <Icon name='time' size={24} />
                <Flex col gap={10} grow>
                    <Flex alignItems='center' justifyContent='space-between' grow>
                        <Text size='h2' bold>{bannerTitleKey}</Text>
                        <Text size='h2' bold>{bannerTime}</Text>
                    </Flex>
                    <Flex gap={5}>
                        <Text size='m' className={styles.subtitle}>{bannerSubtitleKey}</Text>
                        {/* A closed order has no time left to run out of, so the countdown
                            does not belong on it. */}
                        {!isClosedOrder(order.status) && <RemainingTime size='m' className={styles.subtitle} window={order.window} />}
                    </Flex>
                </Flex>
            </Flex>
            <Flex col gap={25} className={styles.priviewRows}>
                {rows}
            </Flex>
        </Flex>
        {footer}
    </Flex>
}

function PreviewFooter({ primaryKey, primaryDisabled, onPrimary, linkKey, onLink, extra }) {
    return <Flex center gap={20} col className={styles.footer}>
        {/* A closed order has no action to offer, so it renders only the link. */}
        {onPrimary && <Button className={styles.startPickingBtn} disabled={primaryDisabled} onClick={onPrimary}>{primaryKey}</Button>}
        {extra}
        {linkKey && <Button mode='text-brand' onClick={onLink}>{linkKey}</Button>}
    </Flex>
}

function OrderView({ order = {}, setStep }) {
    const entries = groupCart(order.cart || [])

    return <Flex grow col className={styles.orderPick}>
        <Flex alignItems='center' justifyContent='center' style={{ padding: 16 }}>
            <Text size='l' bold>ops_view_title</Text>
        </Flex>
        <Flex grow col gap={10} className={styles.cartList}>
            {entries.map(entry => entry.type === 'pair'
                ? <ReplacementCard key={entry.key} original={entry.original} replacer={entry.replacer} />
                : <ProductInline key={entry.key} product={entry.product} remove={false} note={false} admin />
            )}
        </Flex>
        <Flex center gap={20} className={styles.footer}>
            <Button mode='text-brand' onClick={() => setStep(STEPS.PREVIEW)}>back</Button>
        </Flex>
    </Flex>
}

// Worker block: one divider, then whoever handled the order.
function HandlerBlock({ picker, shipper }) {
    const people = [picker, shipper].filter(p => p?.name)
    if (!people.length) return null
    return <>
        <Divider />
        {people.map(({ name }, i) => <PriviewRow
            key={i}
            icon={i == 0 ? 'basket' : 'truck'}
            label={i == 0 ? 'picker_name' : 'shipper_name'}
            value={name}
        />)}
    </>
}
function ElevatorRow({ order }) {
    if (order?.deliveryMethod === 'pickup') return null
    const hasElevator = order?.address?.hasElevator !== false
    return <PriviewRow
        icon='building'
        label='address.hasElevator'
        value={TR(hasElevator ? 'elevator_yes' : 'elevator_no')}
    />
}

// Divider between the customer block and the handler blocks.
function Divider() {
    return <div className={styles.divider} />
}

function PriviewRow({ icon, label, value, actionIcon, actionTooltip, onAction }) {
    return <Flex gap={10} alignItems={value ? 'start' : 'center'} justifyContent='space-between' className={styles.priviewRow} onClick={onAction} style={onAction ? { cursor: 'pointer' } : undefined}>
        <Flex gap={10} alignItems={value ? 'start' : 'center'}>
            <Icon name={icon} size={24} />
            <Flex col gap={5} >
                <Text size='l' bold>{label}</Text>
                {value ? <Text >{value}</Text> : null}
            </Flex>
        </Flex>
        {actionIcon && <Button mode='text' icon={actionIcon} tooltip={actionTooltip} onClick={onAction} stopPropagation className={styles.rowAction} />}
    </Flex>
}

function OrderPick({ order = {}, setStep, onPicked }) {
    const [tab, setTab] = useState()
    const [completing, setCompleting] = useState(false)
    const { openModal, closeModal } = useModal()
    const isScanned = p => p.finalAmount != null || !!p.missing
    // group replaced originals with their replacer into one yellow linked card (image-3 style)
    const entries = groupCart(order.cart || [])
    const pairs = entries.filter(e => e.type === 'pair')
    const singleItems = entries.filter(e => e.type === 'product')
    const toPickItems = singleItems.filter(e => !isScanned(e.product))
    const donePickItems = singleItems.filter(e => isScanned(e.product))
    const isDoneTab = tab === 'done_pick'
    const isWaitTab = tab === 'wait_pick'
    const displayed = isDoneTab ? donePickItems : isWaitTab ? [] : toPickItems
    const displayedPairs = isDoneTab ? pairs : []
    const allHandled = toPickItems.length === 0 && entries.length > 0


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
                { text: 'done_pick', badge: donePickItems.length + pairs.length },
            ]} />
        <Flex grow col gap={10} className={styles.cartList}>
            {displayedPairs.map(({ original, replacer, key }) => (
                <ReplacementCard
                    key={key}
                    original={original}
                    replacer={replacer}
                    onClick={() => handleProductClick(replacer)}
                />
            ))}
            {displayed.map(({ product, key }) => (
                <ProductInline
                    key={key}
                    product={product}
                    remove={false}
                    note={false}
                    admin
                    onClick={() => handleProductClick(product)}
                    style={{ cursor: 'pointer' }}
                />
            ))}
        </Flex>
        <Flex center gap={10} col className={styles.footer}>
            <Button disabled={!allHandled} loading={completing} onClick={handleFinishPick} className={styles.finishBtn}>finish_pick</Button>
            {toPickItems.length === 0 && order.phone && <Button
                mode='text-brand'
                icon='phoneOutgoing'
                onClick={() => { window.location.href = `tel:${String(order.phone).replace(/[^+\d]/g, '')}` }}
            >ops_call_customer</Button>}
        </Flex>
    </Flex>
}

function OrderPack({ order = {}, onPicked }) {
    const navigate = useNavigate()
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
            // Replace the finished screen: back from the queue goes to the order
            // details, not to a screen that is already done.
            navigate('/ops', { replace: true })
        } catch (e) {
            setPackError(e)
        } finally {
            setLoading(false)
        }
    }

    const chargeAmount = packError?.amount ?? order.finalSumWithShipping ?? order.sumWithShipping ?? order.finalSum ?? order.sum

    return <Flex grow col className={styles.orderPack}>
        <Flex col gap={6} className={styles.packInstruction}>
            <Text bold size="m">ops_pack_instruction</Text>
        </Flex>
        {packError ? <Flex col gap={8} className={styles.packError}>
            <Text bold size="m" mode="error">ops_pack_charge_failed</Text>
            <Text size="s" mode="error">{packError.message || TR('ops_payment_error')}</Text>
            {chargeAmount ? <Text size="s">{TR('ops_pack_charge_amount', { amount: chargeAmount })}</Text> : null}
            {packError.capturedTotal > 0 ? <Text size="s">{TR('ops_pack_charged', { total: packError.capturedTotal })}{packError.delta > 0 ? TR('ops_pack_remaining', { delta: packError.delta }) : null}</Text> : null}
            {order.payment?.last4digits ? <Text size="s">{TR('ops_pack_card', { last4: order.payment.last4digits })}</Text> : null}
            {packError.providerCode !== undefined ? <Text size="s">{TR('ops_pack_provider_code', { code: packError.providerCode })}</Text> : null}
            <Button mode="text-brand" onClick={handleTransfer}>ops_retry</Button>
        </Flex> : null}

        <Flex col gap={14} className={styles.packList}>
            <BagRow icon="box" labelKey="ops_bags_regular" value={regular} onChange={setRegular} />
            <BagRow icon="snow" labelKey="ops_bags_cold" value={cold} onChange={setCold} />
            <BagRow icon="bag" labelKey="ops_bags_other" value={freeze} onChange={setFreeze} />
        </Flex>

        <Flex center className={styles.footer}>
            <Button loading={loading} onClick={handleTransfer} className={styles.transferBtn}>ops_transfer_to_ship</Button>
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
                setStep(STEPS.PREVIEW)
                return
            }
            navigate('/ops', { replace: true })
        } catch (e) {
            alert(e.message || 'shipment/start failed')
            setStep(STEPS.PREVIEW)
        } finally {
            setLoading(false)
        }
    }

    return <Flex grow col className={styles.orderPack}>
        <Flex col gap={6} className={styles.packInstruction}>
            <Text bold size="m">ops_confirm_bags_title</Text>
        </Flex>

        <Flex col gap={14} className={styles.packList}>
            <BagRow icon="box" labelKey="ops_bags_regular" value={regular} onChange={handleChange(setRegular)} expected={expected.regular} />
            <BagRow icon="snow" labelKey="ops_bags_cold" value={cold} onChange={handleChange(setCold)} expected={expected.cold} />
            <BagRow icon="bag" labelKey="ops_bags_other" value={other} onChange={handleChange(setOther)} expected={expected.other} />
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

function BagRow({ icon, labelKey, value, onChange, expected }) {
    return <Flex justifyContent="space-between" alignItems="center" className={styles.packRow}>
        <Flex gap={8} alignItems="center">
            <Icon name={icon} size={20} className={styles.packIcon} />
            <Text size="m">{labelKey}</Text>
        </Flex>
        <Flex gap={10} alignItems="center">
            {expected != null && <Flex gap={4} alignItems="center" className={styles.expected}>
                <Text size="s" mode="sub">ops_expected</Text>
                <Text size="s" bold>{expected}</Text>
            </Flex>}
            <Stepper value={value} onChange={onChange} />
        </Flex>
    </Flex>
}

