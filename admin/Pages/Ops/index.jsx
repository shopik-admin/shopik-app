import { useData } from 'features/DataManager/DataProvider'
import DataManager from 'features/DataManager'
import Flex from 'common/components/Flex'
import styles from './ops.module.css'
import OrderCard from './OrderCard'

const opsCols = [
    { key: 'number' },
    { key: 'status', type: 'tr' },
    { key: 'storeId' },
    { key: 'deliveryMethod', type: 'tr' },
    { key: 'window.date', type: 'tr' },
]

export default function Ops({ }) {
    return <DataManager
        apiRoute='order/ops'
        actions={['refresh']}
        defaultSort={{ 'window.endTimestamp': 1 }}
        cols={opsCols}
    >
        <OpsInner />
    </DataManager>
}

function OpsInner() {
    const { data: orders = [] } = useData()
    return <Flex col gap={10} className={styles.ops}>
        {orders.map(order => <OrderCard key={order.number} order={order} />)}
    </Flex>
}


