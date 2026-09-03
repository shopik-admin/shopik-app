import { DeliveryMethodTag, formatWindow } from '../orderUtils'
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
import { useParams } from 'react-router'
import { useUser } from 'features/User'
import { useState, useEffect } from 'react'
import Tabs from '#common/components/Tabs/index.jsx'
import ProductInline from 'common/components/ProductInline'
import Stepper from 'common/components/Stepper'
import { useModal } from 'common/components/Modal'
import ProductPickModal from './ProductPickModal'

const STEPS = {
    PREVIEW: 0,
    PICK: 1,
    PACK: 2,
    SHIP: 3
}

const stepRenderer = [
    OrderPreview,
    OrderPick,
    OrderPack,
    OrderShip,
]

export default function OpsOrder({ }) {
    const [step, setStep] = useState(STEPS.PREVIEW)
    const StepComponent = stepRenderer[step] || null
    const { orderId } = useParams()
    const { error, loading, data = [], setData } = useApi(`order/ops/read`, { filter: { id: orderId } })
    const order = data[0] || {}
    const { id } = useUser()
    const isMine = id == order.picker?.adminId,
        cantPick = !isMine && order.picker?.adminId

    useEffect(() => {
        if (loading || !order?.status) return
        if (order.status === 'picked' && step === STEPS.PREVIEW) setStep(STEPS.PACK)
        else if (order.status === 'packed' && step === STEPS.PREVIEW) setStep(STEPS.SHIP)
        else if (order.status === 'picking' && step === STEPS.PREVIEW && isMine) setStep(STEPS.PICK)
    }, [order.status, loading, isMine])


    if (loading) return <Loader />
    if (error) return <Text center mode='error'>{error.message}</Text>
    if (!order) return <Text center mode='error'>No order found</Text>
    async function claimOrder() {
        const res = await apiReq('order/ops/claim', { id: order.id })
        if (res.error) {
            alert(res.error)
            return
        }
        setData([res.data])
        setStep(STEPS.PICK)
    }
    function handlePicked(updatedOrder) {
        if (updatedOrder) {
            // server returns updated order doc directly, or wrapped in data
            const newDoc = updatedOrder.cart ? updatedOrder : updatedOrder.data || updatedOrder
            if (newDoc?.id) setData([newDoc])
            else setData(prev => prev)
        }
    }

    return StepComponent ? <StepComponent
        order={order}
        claimOrder={claimOrder}
        isMine={isMine}
        cantPick={cantPick}
        setStep={setStep}
        onPicked={handlePicked}
    /> : null
}

function OrderPreview({ order = {}, claimOrder, isMine, cantPick, setStep }) {
    const windowTime = formatWindow(order.window)

    return <Flex col className={styles.orderPreview}>
        <Flex grow col gap={30}>
            <Flex alignItems='center' justifyContent='space-between'>
                <DeliveryMethodTag deliveryMethod={order.deliveryMethod} />
                <Text bold>{order.number}</Text>
            </Flex>
            <Flex gap={5} className={classNames(styles.intro, styles[windowTime.isLate ? 'danger' : windowTime.isAlmostLate ? 'warning' : 'success'])}>
                <Icon name='time' size={24} />
                <Flex col gap={10} grow>
                    <Flex alignItems='center' justifyContent='space-between' grow>
                        <Text size='h2' bold>time_to_pick_title</Text>
                        <Text size='h2' bold>{windowTime.text}</Text>
                    </Flex>
                    <Text size='m' className={styles.subtitle}>time_to_pick_subtitle</Text>
                </Flex>
            </Flex>
            <Flex col gap={25} className={styles.priviewRows}>
                <PriviewRow icon='user' label='customer_name' value={order.phone || '0500000000'} />
                <PriviewRow icon='location' label='customer_address' value={render({ type: 'address', value: order.address })} />
                <PriviewRow icon='time' label='order_window' value={windowTime.dayText} />
                <PriviewRow icon='replace' label='replace_and_missing' value={order.window?.replace} />
                <PriviewRow icon='note' label='pick_notes' value={order.comments} />
            </Flex>
        </Flex>
        <Flex center gap={20} col className={styles.footer}>
            <Button className={styles.startPickingBtn} disabled={cantPick} onClick={isMine ? () => setStep(STEPS.PICK) : claimOrder}>{'start picking'}</Button>
            <Button mode='text-brand' onClick={() => setStep(STEPS.PICK)}>view order</Button>
        </Flex>
    </Flex>
}

function PriviewRow({ icon, label, value }) {
    return <Flex gap={10} alignItems={value ? 'start' : 'center'} className={styles.priviewRow}>
        <Icon name={icon} size={24} />
        <Flex col gap={5} >
            <Text size='l' bold>{label}</Text>
            {value ? <Text >{value}</Text> : null}
        </Flex>
    </Flex>
}

function OrderPick({ order = {}, setStep, onPicked }) {
    const [tab, setTab] = useState()
    const [completing, setCompleting] = useState(false)
    const { openModal, closeModal } = useModal()
    const cart = order.cart || []
    const isScanned = p => p.finalAmount != null || !!p.missing
    const toPickItems = cart.filter(p => !isScanned(p))
    const donePickItems = cart.filter(p => isScanned(p))
    const isDoneTab = tab === 'done_pick' || tab === 2
    const isWaitTab = tab === 'wait_pick' || tab === 1
    const displayed = isDoneTab ? donePickItems : isWaitTab ? [] : toPickItems
    const allHandled = toPickItems.length === 0 && cart.length > 0

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
                { text: 'done_pick', badge: donePickItems.length },
            ]} />
        <Flex grow col gap={10} className={styles.cartList}>
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
            <Button disabled={!allHandled} loading={completing} onClick={handleFinishPick} className={styles.finishBtn}>finish pick</Button>
        </Flex>
    </Flex>
}

function OrderPack({ order = {}, setStep, onPicked }) {
    const [loading, setLoading] = useState(false)
    const [regular, setRegular] = useState(order.bags?.regular ?? 0)
    const [cold, setCold] = useState(order.bags?.cold ?? 0)
    const [freeze, setFreeze] = useState(order.bags?.freeze ?? 0)

    async function handleTransfer() {
        if (loading) return
        setLoading(true)
        try {
            const bags = {
                regular: Number(regular) || 0,
                cold: Number(cold) || 0,
                freeze: Number(freeze) || 0,
            }
            const res = await apiReq('order/ops/pack', { id: order.id, bags })
            if (res?.error) {
                alert(res.error)
                return
            }
            const updated = res?.data || res
            if (updated?.id) onPicked?.(updated)
            setStep(STEPS.SHIP)
        } catch (e) {
            alert(e.message || 'pack failed')
        } finally {
            setLoading(false)
        }
    }

    return <Flex grow col className={styles.orderPack}>
        <Flex col gap={6} className={styles.packInstruction}>
            <Text bold size="m">נא להזין כמות אריזות מדויקת בסיום האריזה</Text>
        </Flex>

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

function OrderShip({ order = {} }) {
    return <Flex>
        <Text>ship</Text>
    </Flex>
}
