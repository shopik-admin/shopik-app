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

    return <Flex col className={styles.orderPreview}>
        <Text>preview</Text>
        <Button className={styles.startPickingBtn} disabled={cantPick} onClick={isMine ? () => setStep(STEPS.PICK) : claimOrder}>{'start picking'}</Button>
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
