import DataManager from 'features/DataManager'
import styles from './orders.module.css'

export default function Orders({ }) {
    return <div className={styles.orders}>
        <DataManager
            apiRoute='order'
            actions={['export', 'refresh']}
            defaultSort={{ updatedAt: -1 }}
            onRowClick={console.log}
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
