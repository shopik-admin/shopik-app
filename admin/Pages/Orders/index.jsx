import DataManager from 'features/DataManager'
import { useNavigate } from 'react-router'
import styles from './orders.module.css'

export default function Orders({ }) {
    const navigate = useNavigate()
    return <div className={styles.orders}>
        <DataManager
            apiRoute='order'
            actions={['export', 'refresh']}
            defaultSort={{ updatedAt: -1 }}
            onRowClick={row => navigate(`/orders/${row.id}`)}
            cols={[
                { key: 'number' },
                { key: 'name', type: 'name' },
                { key: 'phone' },
                { key: 'email' },
                { key: 'status', type: 'tr' },
                { key: 'deliveryMethod', type: 'tr' },
                { key: 'sum', type: 'coin' },
                { key: 'paid', type: 'boolean' },
                { key: 'window.endTimestamp', type: 'datetime' }
            ]}
        />
    </div>
}
