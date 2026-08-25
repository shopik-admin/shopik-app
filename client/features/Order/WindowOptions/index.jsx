import HorizontalScroll from 'common/components/HorizontalScroll'
import Address from 'pages/Account/Addresses/Address'
import classNames from 'common/functions/classNames'
import styles from './windowOptions.module.css'
import Loader from 'common/components/Loader'
import useApi from 'common/functions/useApi'
import apiReq from 'common/functions/apiReq'
import { useEffect, useState } from 'react'
import { useOrder } from '../OrderProvider'
import Text from 'common/components/Text'
import Flex from 'common/components/Flex'
import { useUser } from 'features/User'


export default function WindowOptions() {
    const { order, setOrder } = useOrder()
    const { addresses } = useUser()
    const { data, loading } = useApi('order/window/options')

    const [windowLoading, setWindowLoading] = useState(null)
    const [activeDay, setActiveDay] = useState(null)

    const activeWindow = order.window

    useEffect(() => {
        if (data && !activeDay) {
            setActiveDay(data.find(d => d.windows.some(w => w.id === activeWindow?.id)) || data[0])
        }
    }, [data, activeWindow])

    if (loading) return <Loader />

    const activeAddress = addresses?.find(a => a.active)

    const onChoose = async (window) => {
        if (window.chosen || window.disabled || windowLoading) return
        try {
            setWindowLoading(window.id)
            const updatedOrder = await apiReq('order/window/choose', { windowId: window.id })
            setOrder(updatedOrder)
        } finally {
            setWindowLoading(null)
        }
    }

    return <Flex col gap={20} className={styles.windowOptions}>
        <Address address={activeAddress} />
        <Text bold>Choose day</Text>

        <HorizontalScroll items={data?.map(day => (
            <Flex
                key={`${day.dayOfMonth}-${day.month}`}
                className={classNames(styles.day, [styles.active, activeDay?.dayOfMonth === day.dayOfMonth])}
                onClick={() => setActiveDay(day)}
                data-active={day === activeDay || undefined}
                gap={5} col center
            >
                <Text bold>{`day-${day.dayOfWeek}-short`}</Text>
                <div>
                    <Text size="s">{day.dayOfMonth} </Text>
                    <Text size="s">{`month-${day.month}-short`}</Text>
                </div>
            </Flex>
        ))} />

        <Text bold>Choose window</Text>
        <Flex col gap={10}>
            {activeDay?.windows?.map(window => {
                const isSelected = window.id === activeWindow?.id
                return (
                    <Flex
                        key={window.id}
                        className={classNames(styles.time, [styles.active, isSelected])}
                        onClick={() => onChoose(window)}
                        gap={10} justifyContent="space-between" alignItems="center"
                    >
                        <Text bold>{window.start}:00 - {window.end}:00</Text>
                        {windowLoading === window.id ? <Loader size={14} /> : (
                            <Text mode="sub">{isSelected ? 'Chosen window' : window.note || 'Available'}</Text>
                        )}
                    </Flex>
                )
            })}
        </Flex>
    </Flex>
}
