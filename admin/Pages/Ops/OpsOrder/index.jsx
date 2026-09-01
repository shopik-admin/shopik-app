import useApi from '#common/functions/useApi.js'
import { useParams } from 'react-router'
import styles from './opsOrder.module.css'
import Loader from '#common/components/Loader/index.jsx'
import Text from '#common/components/Text/index.jsx'
import { useState } from 'react'
import Flex from '#common/components/Flex/index.jsx'
import Button from '#common/components/Button/index.jsx'
import { useUser } from 'features/User'
import apiReq from '#common/functions/apiReq.js'
import { DeliveryMethodTag, formatDayWindow, formatTimeHM } from '../orderUtils'
import classNames from '#common/functions/classNames.js'
import Icon from '#common/components/Icon/index.jsx'
import render from '#common/functions/render.js'

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
    const { error, loading, data = [], setData } = useApi(`order/ops/read`, { id: orderId })
    const order = data[0] || {}
    const { id } = useUser()
    const isMine = id == order.picker?.adminId,
        cantPick = !isMine && order.picker?.adminId


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
    return <div className={styles.opsOrder}>
        {StepComponent ? <StepComponent
            order={order}
            claimOrder={claimOrder}
            isMine={isMine}
            cantPick={cantPick}
            setStep={setStep}
        /> : null}
    </div>
}

function OrderPreview({ order = {}, claimOrder, isMine, cantPick, setStep }) {
    const windowTime = formatTimeHM(order.window)
    return <Flex col className={styles.orderPreview}>
        <Flex grow col gap={20}>
            <Flex alignItems='center' justifyContent='space-between'>
                <DeliveryMethodTag deliveryMethod={order.deliveryMethod} />
                <Text bold>{order.number}</Text>
            </Flex>
            <Flex gap={5} className={classNames(styles.intro, [styles.success, order])}>
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
                <PriviewRow icon='user' label='customer_name' value={order.phone} />
                <PriviewRow icon='location' label='customer_address' value={render({ type: 'address', value: order.address })} />
                <PriviewRow icon='time' label='order_window' value={windowTime.text} />
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
    return <Flex gap={10}>
        <Icon name={icon} size={24} />
        <Flex col gap={5}>
            <Text size='l' bold>{label}</Text>
            <Text >{value}</Text>
        </Flex>
    </Flex>
}

function OrderPick({ order = {}, setStep }) {
    return <Flex>
        <Text>pick</Text>
    </Flex>
}

function OrderPack({ order = {} }) {
    return <Flex>
        <Text>pack</Text>
    </Flex>
}

function OrderShip({ order = {} }) {
    return <Flex>
        <Text>ship</Text>
    </Flex>
}
